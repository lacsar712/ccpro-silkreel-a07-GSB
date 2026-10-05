"""缫丝盆门槛：改缫丝中须挂未解封铅封；标已缫完须最近汤温 38～42℃。"""

from app.models import Basin, LeadSeal

MIN_TEMP = 38.0
MAX_TEMP = 42.0
SEAL_NO_MIN = 1
SEAL_NO_MAX = 999


class RuleError(ValueError):
    pass


def latest_temp(basin: Basin) -> float | None:
    if not basin.readings:
        return None
    latest = max(basin.readings, key=lambda r: r.taken_at)
    return latest.water_temp_c


def open_lock(basin: Basin) -> LeadSeal | None:
    """该盆当前未解封的铅封，没有则 None。"""
    for seal in basin.seals or []:
        if seal.unsealed_at is None:
            return seal
    return None


def parse_seal_no(raw) -> int:
    """铅封号须为 1 到 999 的整数，否则 RuleError。"""
    if isinstance(raw, bool):
        raise RuleError(f"铅封号须为 {SEAL_NO_MIN} 到 {SEAL_NO_MAX} 的整数")
    if isinstance(raw, int):
        no = raw
    elif isinstance(raw, float) and raw.is_integer():
        no = int(raw)
    elif isinstance(raw, str) and raw.strip().isdigit():
        no = int(raw.strip())
    else:
        raise RuleError(f"铅封号须为 {SEAL_NO_MIN} 到 {SEAL_NO_MAX} 的整数")
    if no < SEAL_NO_MIN or no > SEAL_NO_MAX:
        raise RuleError(f"铅封号须为 {SEAL_NO_MIN} 到 {SEAL_NO_MAX} 的整数")
    return no


def assert_can_set_status(basin: Basin, new_status: str) -> None:
    allowed = {Basin.STATUS_SOAKING, Basin.STATUS_REELING, Basin.STATUS_REELED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status == Basin.STATUS_REELING:
        if open_lock(basin) is None:
            raise RuleError("该盆没有未解封的铅封，不能改成缫丝中")
        return
    if new_status != Basin.STATUS_REELED:
        return
    temp = latest_temp(basin)
    if temp is None:
        raise RuleError("该盆尚无汤温记录，不能标已缫完")
    if temp < MIN_TEMP or temp > MAX_TEMP:
        raise RuleError(
            f"最近汤温 {temp}℃ 不在 {MIN_TEMP:.0f}～{MAX_TEMP:.0f}℃，不能标已缫完"
        )
