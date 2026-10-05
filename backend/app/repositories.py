from sqlalchemy import select
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

    async def open_seals(self, seal_no: int | None = None) -> list[LeadSeal]:
        stmt = (
            select(LeadSeal)
            .options(selectinload(LeadSeal.basin))
            .where(LeadSeal.unsealed_at.is_(None))
            .order_by(LeadSeal.seal_no, LeadSeal.id)
        )
        if seal_no is not None:
            stmt = stmt.where(LeadSeal.seal_no == seal_no)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, seal_id: int) -> LeadSeal | None:
        result = await self.session.execute(
            select(LeadSeal)
            .options(selectinload(LeadSeal.basin))
            .where(LeadSeal.id == seal_id)
        )
        return result.scalar_one_or_none()

    async def open_by_no(self, seal_no: int) -> LeadSeal | None:
        result = await self.session.execute(
            select(LeadSeal).where(
                LeadSeal.seal_no == seal_no,
                LeadSeal.unsealed_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def bind(self, basin: Basin, seal_no: int, operator: str) -> LeadSeal:
        row = LeadSeal(basin=basin, seal_no=seal_no, bound_by=operator)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def unseal(self, seal: LeadSeal) -> None:
        seal.unsealed_at = utcnow()
        await self.session.commit()
