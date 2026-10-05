import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, clearToken, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };

function Login({ onOk }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.access_token);
      onOk(data.user);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div class="login">
      <h1>江口缫丝坞</h1>
      <p>汤温环盆作业台，不是列表台账。</p>
      <form onSubmit={submit} autocomplete="off">
        <label>
          用户名
          <input name="username" autocomplete="off" value={username} onInput={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          密码
          <input name="password" type="password" autocomplete="off" value={password} onInput={(e) => setPassword(e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button type="submit">登录</button>
      </form>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function TopBar({ view, setView, user, subtitle }) {
  return (
    <div class="topbar">
      <div>
        <h1>江口缫丝坞</h1>
        <nav class="nav">
          <button class={view === "yard" ? "nav-on" : ""} onClick={() => setView("yard")}>
            环盆作业台
          </button>
          <button class={view === "seals" ? "nav-on" : ""} onClick={() => setView("seals")}>
            茧笼铅封
          </button>
        </nav>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div class="who">
        <span>
          {user.username}（{user.role === "admin" ? "管理员" : "缫丝工"}）
        </span>
        <button
          onClick={() => {
            clearToken();
            location.reload();
          }}
        >
          退出
        </button>
      </div>
    </div>
  );
}

function Yard({ user, page, setPage }) {
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
    setPicked((prev) =>
      prev ? data.basins.find((b) => b.id === prev.id) || null : null
    );
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  if (!board) {
    return (
      <div class="yard">
        <TopBar view={page} setView={setPage} user={user} />
        {err || "装载环盆…"}
      </div>
    );
  }

  const n = board.basins.length;

  async function writeTemp() {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/readings`, {
        method: "POST",
        body: JSON.stringify({ waterTempC: Number(temp) }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  async function setStatus(status) {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div class="yard">
      <TopBar
        view={page}
        setView={setPage}
        user={user}
        subtitle={`${board.riverside} · 点盆登记汤温；改缫丝中须先挂未解封铅封；已缫完须最近汤温 38～42℃`}
      />
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status} ${picked && picked.id === b.id ? "picked" : ""}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => {
                setPicked(b);
                setErr("");
              }}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
              {b.sealed && <span class="lockmark">🔒{b.sealNumber}</span>}
            </button>
          );
        })}
      </div>
      {picked && (
        <div class="drawer">
          <h3>
            {picked.code} · {STATUS_LABEL[picked.status]}
          </h3>
          <p>最近汤温：{picked.latestTempC ?? "无"} ℃ · 记录 {picked.readingCount} 次</p>
          {picked.sealed ? (
            <p class="seal-ok">
              🔒 铅封 {picked.sealNumber} 号未解封，笼口锁着
            </p>
          ) : (
            <p class="seal-warn">⚠️ 该盆没有未解封铅封，不能改成缫丝中，先到「茧笼铅封」绑锁</p>
          )}
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp}>登记汤温</button>
          <div>
            <button onClick={() => setStatus("soaking")}>浸茧</button>
            <button
              disabled={!picked.sealed}
              title={picked.sealed ? "" : "没有未解封铅封，不能改缫丝中"}
              onClick={() => setStatus("reeling")}
            >
              缫丝中
            </button>
            <button onClick={() => setStatus("reeled")}>已缫完</button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function SealsPage({ user, page, setPage }) {
  const [seals, setSeals] = useState(null);
  const [basins, setBasins] = useState([]);
  const [filter, setFilter] = useState("");
  const [basinId, setBasinId] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function loadBasins() {
    const data = await api("/api/board");
    setBasins(data.basins);
    if (!basinId && data.basins.length) setBasinId(String(data.basins[0].id));
  }

  async function loadSeals(number) {
    const q = number ? `?number=${encodeURIComponent(number)}` : "";
    const data = await api(`/api/seals${q}`);
    setSeals(data.seals);
  }

  useEffect(() => {
    setErr("");
    loadBasins().catch((e) => setErr(e.message));
    loadSeals("").catch((e) => setErr(e.message));
  }, []);

  async function applyFilter(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await loadSeals(filter.trim());
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function clearFilter() {
    setFilter("");
    setErr("");
    await loadSeals("");
  }

  async function bind(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await api("/api/seals", {
        method: "POST",
        body: JSON.stringify({ basinId: Number(basinId), sealNumber: sealNumber.trim() }),
      });
      setMsg(`铅封 ${sealNumber.trim()} 号已绑出`);
      setSealNumber("");
      await loadSeals(filter.trim());
      await loadBasins();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function unseal(seal) {
    setErr("");
    setMsg("");
    try {
      await api(`/api/seals/${seal.id}/unseal`, { method: "POST" });
      setMsg(`铅封 ${seal.sealNumber} 号已解封`);
      await loadSeals(filter.trim());
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div class="yard">
      <TopBar view={page} setView={setPage} user={user} subtitle="未解封铅封：同号不得绑第二盆，同盆只许一把；解封仅管理员" />

      <div class="seal-grid">
        <section class="card">
          <h3>绑出铅封</h3>
          <form onSubmit={bind}>
            <label>
              盆
              <select value={basinId} onChange={(e) => setBasinId(e.target.value)}>
                {basins.map((b) => (
                  <option value={b.id}>
                    {b.code}（{STATUS_LABEL[b.status]}
                    {b.sealed ? `·已封${b.sealNumber}号` : ""}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              铅封号（1–999 整数）
              <input
                value={sealNumber}
                placeholder="如 17"
                onInput={(e) => setSealNumber(e.target.value)}
              />
            </label>
            <button type="submit">绑出</button>
          </form>
          <p class="hint">绑出人：{user.username}</p>
        </section>

        <section class="card">
          <h3>未解封铅封</h3>
          <form class="filter" onSubmit={applyFilter}>
            <input
              value={filter}
              placeholder="按铅封号筛"
              onInput={(e) => setFilter(e.target.value)}
            />
            <button type="submit">筛</button>
            <button type="button" onClick={clearFilter}>
              全部
            </button>
          </form>
          {seals === null ? (
            <p>装载…</p>
          ) : seals.length === 0 ? (
            <p class="hint">没有未解封铅封。</p>
          ) : (
            <table class="seal-table">
              <thead>
                <tr>
                  <th>铅封号</th>
                  <th>盆</th>
                  <th>绑出时刻</th>
                  <th>绑出人</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {seals.map((s) => (
                  <tr key={s.id}>
                    <td>🔒 {s.sealNumber}</td>
                    <td>{s.basinCode}</td>
                    <td>{fmtTime(s.boundAt)}</td>
                    <td>{s.boundBy}</td>
                    <td>
                      {user.role === "admin" ? (
                        <button onClick={() => unseal(s)}>解封</button>
                      ) : (
                        <span class="hint">仅管理员</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {msg && <p class="seal-ok">{msg}</p>}
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(Boolean(token()));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!token()) return;
    api("/api/auth/me")
      .then(setUser)
      .catch(() => {
        clearToken();
        setReady(false);
      });
  }, []);

  if (!ready) {
    return <Login onOk={(u) => { setUser(u); setReady(true); }} />;
  }
  if (!user) return <div class="yard">装载…</div>;
  return <YardWithUser user={user} />;
}

function YardWithUser({ user }) {
  // 默认进环盆作业台；页码在顶栏切换，切页重新装载数据。
  const [page, setPage] = useState("yard");
  return page === "yard" ? (
    <Yard key="yard" user={user} page={page} setPage={setPage} />
  ) : (
    <SealsPage key="seals" user={user} page={page} setPage={setPage} />
  );
}

render(<App />, document.getElementById("app"));
