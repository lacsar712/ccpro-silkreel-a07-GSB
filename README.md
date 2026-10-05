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

- 盆状态不可标成「已缫完」，除非该盆**最近一条**汤温记录落在 **38～42℃**。规则在 `backend/app/services.py`。
- 盆从「浸茧」改成「缫丝中」前，必须先在**茧笼铅封**页为该盆绑一把未解封铅封；无锁一律中文挡住（后端强制，绕过抽屉直连接口也挡）。登记汤温与标「已缫完」不看铅封。
- 铅封字段：盆、铅封号（**1～999 整数**）、绑出时刻、解封时刻（可空）、绑出人。同一铅封号在未解封期间不得绑第二盆；同一盆未解封锁最多一把——由 PostgreSQL 部分唯一索引兜底，并发抢号也只许一口盆成功。
- 缫丝工可绑锁；**解封仅管理员**。种子数据恰有一盆浸茧、零铅封。

## 快速启动

```bash
cd SilkReel/SilkReel-01
docker compose up --build
```
