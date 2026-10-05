from quart import Quart, g, jsonify, request

from app.db import SessionLocal
from app.models import Basin, LeadSeal
from app.repositories import BasinRepo, SealConflict, SealRepo, UserRepo
from app.security import make_token, parse_token, verify_password
from app.services import (
    RuleError,
    active_seal,
    assert_can_bind,
    assert_can_set_status,
    latest_temp,
    parse_seal_number,
)

app = Quart(__name__)


def _bearer() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:]
    return None


@app.before_request
async def load_user():
    g.user = None
    token = _bearer()
    if not token:
        return
    username = parse_token(token)
    if not username:
        return
    async with SessionLocal() as session:
        g.user = await UserRepo(session).by_username(username)


def require_user():
    if g.user is None:
        return jsonify({"detail": "未登录"}), 401
    return None


def require_admin():
    denied = require_user()
    if denied:
        return denied
    if g.user.role != "admin":
        return jsonify({"detail": "只有管理员能解封铅封"}), 403
    return None


@app.route("/api/health")
async def health():
    return {"status": "ok", "service": "SilkReel"}


@app.route("/api/auth/login", methods=["POST"])
async def login():
    body = await request.get_json(force=True)
    username = (body or {}).get("username", "")
    password = (body or {}).get("password", "")
    async with SessionLocal() as session:
        user = await UserRepo(session).by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            return jsonify({"detail": "用户名或密码错误"}), 401
        return {
            "access_token": make_token(user.username),
            "user": {"username": user.username, "role": user.role},
        }


@app.route("/api/auth/me")
async def me():
    denied = require_user()
    if denied:
        return denied
    return {"username": g.user.username, "role": g.user.role}


def _basin_json(basin: Basin) -> dict:
    seal = active_seal(basin)
    return {
        "id": basin.id,
        "code": basin.code,
        "status": basin.status,
        "ringIndex": basin.ring_index,
        "latestTempC": latest_temp(basin),
        "readingCount": len(basin.readings or []),
        "sealed": seal is not None,
        "sealNumber": seal.seal_number if seal else None,
    }


def _seal_json(seal: LeadSeal) -> dict:
    return {
        "id": seal.id,
        "basinId": seal.basin_id,
        "basinCode": seal.basin.code if seal.basin else None,
        "sealNumber": seal.seal_number,
        "boundAt": seal.bound_at.isoformat() if seal.bound_at else None,
        "unsealedAt": seal.unsealed_at.isoformat() if seal.unsealed_at else None,
        "boundBy": seal.bound_by,
        "unsealedBy": seal.unsealed_by,
    }


@app.route("/api/board")
async def board():
    denied = require_user()
    if denied:
        return denied
    async with SessionLocal() as session:
        mill = await BasinRepo(session).board()
        if mill is None:
            return jsonify({"detail": "尚无缫丝坞"}), 404
        basins = sorted(mill.basins, key=lambda b: b.ring_index)
        return {
            "filature": mill.name,
            "riverside": mill.riverside,
            "basins": [_basin_json(b) for b in basins],
        }


@app.route("/api/basins/<int:basin_id>/readings", methods=["POST"])
async def add_reading(basin_id: int):
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True)
    try:
        temp = float((body or {}).get("waterTempC"))
    except (TypeError, ValueError):
        return jsonify({"detail": "汤温必须是数字"}), 400
    async with SessionLocal() as session:
        repo = BasinRepo(session)
        basin = await repo.get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        await repo.add_reading(basin, temp, g.user.username)
        basin = await repo.get(basin_id)
        return _basin_json(basin)


@app.route("/api/basins/<int:basin_id>/status", methods=["POST"])
async def set_status(basin_id: int):
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True)
    status = (body or {}).get("status", "")
    async with SessionLocal() as session:
        repo = BasinRepo(session)
        basin = await repo.get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        try:
            assert_can_set_status(basin, status)
        except RuleError as exc:
            return jsonify({"detail": str(exc)}), 400
        await repo.save_status(basin, status)
        basin = await repo.get(basin_id)
        return _basin_json(basin)


@app.route("/api/seals")
async def list_seals():
    denied = require_user()
    if denied:
        return denied
    number = None
    raw = request.args.get("number")
    if raw not in (None, ""):
        try:
            number = parse_seal_number(raw)
        except RuleError as exc:
            return jsonify({"detail": str(exc)}), 400
    async with SessionLocal() as session:
        seals = await SealRepo(session).list_active(number)
        return {"seals": [_seal_json(s) for s in seals]}


@app.route("/api/seals", methods=["POST"])
async def bind_seal():
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True) or {}
    try:
        number = parse_seal_number(body.get("sealNumber"))
    except RuleError as exc:
        return jsonify({"detail": str(exc)}), 400
    try:
        basin_id = int(body.get("basinId"))
    except (TypeError, ValueError):
        return jsonify({"detail": "须指定要绑锁的盆"}), 400
    async with SessionLocal() as session:
        repo = SealRepo(session)
        basin = await BasinRepo(session).get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        try:
            assert_can_bind(basin)
        except RuleError as exc:
            return jsonify({"detail": str(exc)}), 400
        try:
            seal = await repo.bind(basin, number, g.user.username)
        except SealConflict as exc:
            return jsonify({"detail": str(exc)}), 409
        seal = await repo.get(seal.id)
        return _seal_json(seal)


@app.route("/api/seals/<int:seal_id>/unseal", methods=["POST"])
async def unseal_seal(seal_id: int):
    denied = require_admin()
    if denied:
        return denied
    async with SessionLocal() as session:
        repo = SealRepo(session)
        seal = await repo.get(seal_id)
        if seal is None:
            return jsonify({"detail": "铅封不存在"}), 404
        if seal.unsealed_at is not None:
            return jsonify({"detail": "该铅封已经解封"}), 400
        seal = await repo.unseal(seal, g.user.username)
        return _seal_json(seal)
