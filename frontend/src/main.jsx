import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, clearToken, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };
const ROLE_LABEL = { admin: "管理员", worker: "缫丝工" };

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

function Yard() {
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
    if (picked) {
      setPicked(data.basins.find((b) => b.id === picked.id) || data.basins[0]);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  if (!board) {
    return <div>{err || "装载环盆…"}</div>;
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
    <div>
      <header class="millhead">
        <h1>{board.filature}</h1>
        <p>{board.riverside} · 点盆登记汤温；改缫丝中须已绑未解封铅封；已缫完须最近汤温 38～42℃</p>
      </header>
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => setPicked(b)}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
              {b.sealNo != null && <em class="lock">#{b.sealNo}</em>}
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
          <p>铅封：{picked.sealNo != null ? `#${picked.sealNo}（未解封）` : "无未解封铅封"}</p>
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp}>登记汤温</button>
          <div>
            <button onClick={() => setStatus("soaking")}>浸茧</button>
            <button onClick={() => setStatus("reeling")}>缫丝中</button>
            <button onClick={() => setStatus("reeled")}>已缫完</button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function Seals({ me }) {
  const [seals, setSeals] = useState(null);
  const [basins, setBasins] = useState([]);
  const [basinId, setBasinId] = useState("");
  const [sealNo, setSealNo] = useState("");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    const data = await api("/api/seals");
    setSeals(data.seals);
  }
  async function refreshBasins() {
    const data = await api("/api/board");
    setBasins(data.basins);
    setBasinId((id) => id || (data.basins[0] ? String(data.basins[0].id) : ""));
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
    refreshBasins().catch(() => {});
  }, []);

  const shown = (seals || []).filter((s) =>
    filter.trim() ? String(s.sealNo).includes(filter.trim()) : true
  );

  async function bind(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await api("/api/seals/bind", {
        method: "POST",
        body: JSON.stringify({ basinId: Number(basinId), sealNo: sealNo.trim() }),
      });
      setMsg("绑出成功");
      setSealNo("");
      await refresh();
      await refreshBasins();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function unseal(id) {
    setErr("");
    setMsg("");
    try {
      await api(`/api/seals/${id}/unseal`, { method: "POST" });
      setMsg("已解封");
      await refresh();
      await refreshBasins();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  const isAdmin = me.role === "admin";
  return (
    <div>
      <div class="panel">
        <h2>绑出铅封</h2>
        <form onSubmit={bind} autocomplete="off">
          <label>
            盆
            <select value={basinId} onChange={(e) => setBasinId(e.target.value)}>
              {basins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {STATUS_LABEL[b.status]}
                  {b.sealNo != null ? `（已挂 #${b.sealNo}）` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            铅封号（1～999 整数）
            <input value={sealNo} onInput={(e) => setSealNo(e.target.value)} placeholder="例如 7" />
          </label>
          <button type="submit">绑出</button>
        </form>
        {err && <p class="err">{err}</p>}
        {msg && <p class="msg">{msg}</p>}
      </div>
      <div class="panel">
        <h2>未解封铅封</h2>
        <label>
          按号筛
          <input value={filter} onInput={(e) => setFilter(e.target.value)} placeholder="输入铅封号" />
        </label>
        <table class="seals">
          <thead>
            <tr>
              <th>铅封号</th>
              <th>盆</th>
              <th>绑出时刻</th>
              <th>绑出人</th>
              {isAdmin && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>#{s.sealNo}</td>
                <td>{s.basinCode}</td>
                <td>{s.boundAt ? new Date(s.boundAt).toLocaleString() : ""}</td>
                <td>{s.boundBy}</td>
                {isAdmin && (
                  <td>
                    <button onClick={() => unseal(s.id)}>解封</button>
                  </td>
                )}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td class="hint" colSpan={isAdmin ? 5 : 4}>
                  暂无未解封铅封
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(Boolean(token()));
  const [view, setView] = useState("yard");

  useEffect(() => {
    if (!token()) return;
    api("/api/auth/me")
      .then((user) => setMe(user))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return <div class="yard">装载…</div>;
  }
  if (!me) {
    return <Login onOk={(user) => setMe(user)} />;
  }
  return (
    <div class="yard">
      <div class="topbar">
        <nav class="nav">
          <button class={view === "yard" ? "on" : ""} onClick={() => setView("yard")}>
            环盆作业台
          </button>
          <button class={view === "seals" ? "on" : ""} onClick={() => setView("seals")}>
            茧笼铅封
          </button>
        </nav>
        <div>
          <span class="who">
            {me.username} · {ROLE_LABEL[me.role] || me.role}
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
      {view === "yard" ? <Yard /> : <Seals me={me} />}
    </div>
  );
}

render(<App />, document.getElementById("app"));
