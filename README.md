# SilkReel-01 · 江口缫丝坞

缫丝盆环状作业台。登录后看到的是沿汤池围成一圈的盆位，点盆登记汤温并改状态——不是侧栏双列表 CRUD。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Quart（异步 Flask 族）· Hypercorn |
| 结构 | `repositories.py` 仓储 + `services.py` 门槛，路由不直接拼 SQL |
| 数据 | SQLAlchemy 2 async · asyncpg · PostgreSQL 15 |
| 前端 | Preact 10 · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4760
- API：http://localhost:8760
- PostgreSQL：localhost:6160

## 演示账号

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 管理员 |
| `worker` | `123456` | 缫丝工 |

## 业务规则

- 盆改成「缫丝中」前，该盆须挂有**未解封**的茧笼铅封，否则中文挡住；登记汤温与标「已缫完」不看铅封。
- 盆不可标成「已缫完」，除非该盆**最近一条**汤温记录落在 **38～42℃**。
- 铅封字段：盆、铅封号、绑出时刻、解封时刻（可空）、绑出人。铅封号须为 **1～999** 的整数；同一铅封号未解封期间不得绑第二盆，同一盆未解封最多一把（数据库部分唯一索引兜底，并发抢号只许一口成功）。
- 缫丝工可绑锁，解封仅管理员。顶栏可进「环盆作业台」与「茧笼铅封」专页（未解封列表、绑出、解封、按号筛）。规则在 `backend/app/services.py`。

## 快速启动

```bash
cd SilkReel/SilkReel-01
docker compose up --build
```
