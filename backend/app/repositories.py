from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Basin, BathReading, Filature, LeadSeal, User, utcnow


class UserRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def by_username(self, username: str) -> User | None:
        result = await self.session.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()


class BasinRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def board(self) -> Filature | None:
        result = await self.session.execute(
            select(Filature).options(
                selectinload(Filature.basins).selectinload(Basin.readings),
                selectinload(Filature.basins).selectinload(Basin.seals),
            )
        )
        return result.scalars().first()

    async def get(self, basin_id: int) -> Basin | None:
        result = await self.session.execute(
            select(Basin)
            .options(selectinload(Basin.readings), selectinload(Basin.seals))
            .where(Basin.id == basin_id)
        )
        return result.scalar_one_or_none()

    async def add_reading(self, basin: Basin, temp_c: float, operator: str) -> BathReading:
        row = BathReading(basin=basin, water_temp_c=temp_c, operator=operator)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def save_status(self, basin: Basin, status: str) -> None:
        basin.status = status
        await self.session.commit()


class SealRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_active(self, number: int | None = None) -> list[LeadSeal]:
        stmt = (
            select(LeadSeal)
            .where(LeadSeal.unsealed_at.is_(None))
            .options(selectinload(LeadSeal.basin))
            .order_by(LeadSeal.seal_number)
        )
        if number is not None:
            stmt = stmt.where(LeadSeal.seal_number == number)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def active_for_basin(self, basin_id: int) -> LeadSeal | None:
        result = await self.session.execute(
            select(LeadSeal)
            .where(
                LeadSeal.basin_id == basin_id,
                LeadSeal.unsealed_at.is_(None),
            )
            .order_by(LeadSeal.bound_at)
        )
        return result.scalars().first()

    async def active_with_number(self, seal_number: int) -> LeadSeal | None:
        result = await self.session.execute(
            select(LeadSeal).where(
                LeadSeal.seal_number == seal_number,
                LeadSeal.unsealed_at.is_(None),
            )
        )
        return result.scalars().first()

    async def get(self, seal_id: int) -> LeadSeal | None:
        result = await self.session.execute(
            select(LeadSeal)
            .where(LeadSeal.id == seal_id)
            .options(selectinload(LeadSeal.basin))
        )
        return result.scalar_one_or_none()

    async def bind(
        self, basin: Basin, seal_number: int, username: str
    ) -> LeadSeal:
        """绑出铅封。并发撞号/撞盆由部分唯一索引兜底，这里翻译成业务错误。"""
        seal = LeadSeal(
            basin=basin, seal_number=seal_number, bound_by=username
        )
        self.session.add(seal)
        try:
            await self.session.flush()
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            detail = str(exc.orig)
            if "uq_seal_number_active" in detail:
                raise SealConflict(
                    f"铅封号 {seal_number} 已绑在别的盆上，未解封不得复用"
                )
            if "uq_seal_basin_active" in detail:
                raise SealConflict("该盆已有未解封铅封，一盆只许挂一把")
            raise
        await self.session.refresh(seal)
        return seal

    async def unseal(self, seal: LeadSeal, username: str) -> LeadSeal:
        seal.unsealed_at = utcnow()
        seal.unsealed_by = username
        await self.session.commit()
        await self.session.refresh(seal)
        return seal


class SealConflict(ValueError):
    pass
