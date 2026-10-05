"""缫丝盆门槛。

- 浸茧改缫丝中：该盆必须挂有未解封铅封。
- 标成已缫完：不看铅封，只认最近一次汤温落在 38～42℃。
"""

from app.models import Basin, LeadSeal

MIN_TEMP = 38.0
MAX_TEMP = 42.0
MIN_SEAL_NUMBER = 1
MAX_SEAL_NUMBER = 999


class RuleError(ValueError):
    pass


def latest_temp(basin: Basin) -> float | None:
    if not basin.readings:
        return None
    latest = max(basin.readings, key=lambda r: r.taken_at)
    return latest.water_temp_c


def active_seal(basin: Basin) -> LeadSeal | None:
    return next((s for s in basin.seals if s.unsealed_at is None), None)


def parse_seal_number(raw) -> int:
    if isinstance(raw, bool):
        raise RuleError("铅封号须为 1 到 999 的整数")
    try:
        number = int(raw)
    except (TypeError, ValueError):
        raise RuleError("铅封号须为 1 到 999 的整数")
    if isinstance(raw, float) and float(raw) != float(number):
        raise RuleError("铅封号须为 1 到 999 的整数")
    if number < MIN_SEAL_NUMBER or number > MAX_SEAL_NUMBER:
        raise RuleError("铅封号须为 1 到 999 的整数")
    return number


def assert_can_bind(basin: Basin) -> None:
    """绑锁前的本盆校验；同号是否已占他盆由仓储查重 + 部分唯一索引判定。"""
    if active_seal(basin) is not None:
        raise RuleError("该盆已挂未解封铅封，一盆同时只许一把锁")


def assert_can_set_status(basin: Basin, new_status: str) -> None:
    allowed = {Basin.STATUS_SOAKING, Basin.STATUS_REELING, Basin.STATUS_REELED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status == Basin.STATUS_REELING and active_seal(basin) is None:
        raise RuleError("该盆尚无未解封铅封，先绑铅封再改缫丝中")
    if new_status != Basin.STATUS_REELED:
        return
    temp = latest_temp(basin)
    if temp is None:
        raise RuleError("该盆尚无汤温记录，不能标已缫完")
    if temp < MIN_TEMP or temp > MAX_TEMP:
        raise RuleError(
            f"最近汤温 {temp}℃ 不在 {MIN_TEMP:.0f}～{MAX_TEMP:.0f}℃，不能标已缫完"
        )
