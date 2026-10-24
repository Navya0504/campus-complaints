import { useEffect, useState } from "react";
import { api } from "./api";

const STATUSES = ["Submitted", "In Progress", "Resolved", "Rejected"];
const fmt = (d) => new Date(d + "Z").toLocaleString();
const Badge = ({ s }) => <span className={"badge s" + s.replace(" ", "")}>{s}</span>;

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const d =
        mode === "login"
          ? await api("/auth/login", "POST", { email: f.email, password: f.password })
          : await api("/auth/register", "POST", f);
      onAuth(d);
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <div className="auth">
      <h1>Campus Complaints</h1>
      <p className="muted">Report issues. Track resolution.</p>
      <form onSubmit={submit} className="card">
        <h2>{mode === "login" ? "Login" : "Create account"}</h2>
        {mode === "register" && (
          <input placeholder="Full name" required value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
        )}
        <input type="email" placeholder="Email" required value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="password" placeholder="Password" required value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <div className="err">{err}</div>}
        <button>{mode === "login" ? "Login" : "Register"}</button>
        <a onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Register" : "Have an account? Login"}
        </a>
      </form>
    </div>
  );
}

function Detail({ id, token, user, departments, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [dept, setDept] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const d = await api(`/complaints/${id}`, "GET", null, token);
    setC(d);
    setStatus(d.status);
    setDept(d.department_id);
  };
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [id]);

  const update = async () => {
    try {
      await api(`/complaints/${id}/status`, "PATCH",
        { status, note, department_id: Number(dept) }, token);
      setNote("");
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };
  const sendFeedback = async () => {
    try {
      await api(`/complaints/${id}/feedback`, "POST",
        { rating: Number(rating), comment }, token);
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        {!c ? (err || "Loading...") : (
          <>
            <h2>{c.ticket_id} <Badge s={c.status} /></h2>
            <h3>{c.title}</h3>
            <p>{c.description}</p>
            {c.image_url && <img src={c.image_url} alt="complaint" className="img" />}
            <p className="muted">
              {c.category} · {c.department} · Priority: <b>{c.priority}</b>
              {c.location && ` · ${c.location}`}
            </p>
            <p className="muted">
              By {c.submitted_by} · Due {fmt(c.due_at)}
              {c.is_overdue && <span className="overdue"> OVERDUE</span>}
            </p>

            <h4>Status history</h4>
            <ul className="history">
              {c.history.map((h, i) => (
                <li key={i}>
                  <b>{h.status}</b> — {h.changed_by}, {fmt(h.changed_at)}
                  {h.note && <div className="muted">{h.note}</div>}
                </li>
              ))}
            </ul>

            {user.role === "admin" && (
              <div className="box">
                <h4>Update ticket</h4>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={dept} onChange={(e) => setDept(e.target.value)}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input placeholder="Note (optional)" value={note}
                  onChange={(e) => setNote(e.target.value)} />
                <button onClick={update}>Save</button>
              </div>
            )}

            {user.role !== "admin" && c.status === "Resolved" && !c.feedback && (
              <div className="box">
                <h4>How did we do?</h4>
                <select value={rating} onChange={(e) => setRating(e.target.value)}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
                </select>
                <input placeholder="Comment (optional)" value={comment}
                  onChange={(e) => setComment(e.target.value)} />
                <button onClick={sendFeedback}>Submit feedback</button>
              </div>
            )}
            {c.feedback && (
              <p className="box">Feedback: {c.feedback.rating} ★ {c.feedback.comment}</p>
            )}
            {err && <div className="err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function List({ items, onOpen, showUser }) {
  if (!items.length) return <p className="muted">No complaints yet.</p>;
  return (
    <div className="list">
      {items.map((c) => (
        <div key={c.id} className="card row" onClick={() => onOpen(c.id)}>
          <div>
            <b>{c.ticket_id}</b> · {c.title}
            <div className="muted">
              {c.category} · {c.department} · {c.priority}
              {showUser && ` · ${c.submitted_by}`}
            </div>
          </div>
          <div className="right">
            <Badge s={c.status} />
            {c.is_overdue && <span className="overdue">OVERDUE</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD;
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

function UserView({ token, user }) {
  const empty = { title: "", description: "", category: "", location: "", image_url: "" };
  const [cats, setCats] = useState([]);
  const [list, setList] = useState([]);
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const load = () => api("/complaints", "GET", null, token).then(setList);
  useEffect(() => { api("/categories").then(setCats); load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const c = await api("/complaints", "POST",
        { ...f, category: f.category || null, image_url: f.image_url || null }, token);
      setMsg(`✅ ${c.ticket_id} created → ${c.category}, ${c.department}, priority ${c.priority}`);
      setF(empty);
      load();
    } catch (x) { setMsg(x.message); }
  };
const upload = async (file) => {
  if (!file) return;
  setUploading(true);
  setMsg("");
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", PRESET);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`,
      { method: "POST", body: fd });
    const d = await r.json();
    if (!d.secure_url) throw new Error(d.error?.message || "Upload failed");
    setF((prev) => ({ ...prev, image_url: d.secure_url }));
  } catch (e) {
    setMsg(e.message);
  } finally {
    setUploading(false);
  }
};
  return (
    <>
      <form onSubmit={submit} className="card">
        <h2>Report an issue</h2>
        <input placeholder="Title" required value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea placeholder="Describe the problem" required rows={3} value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })} />
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">Auto-detect category</option>
          {cats.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
        <input placeholder="Location (block / room)" value={f.location}
          onChange={(e) => setF({ ...f, location: e.target.value })} />
        <input type="file" accept="image/*" onChange={(e) => upload(e.target.files[0])} />
        {uploading && <div className="muted">Uploading...</div>}
        {f.image_url && <img src={f.image_url} alt="preview" className="img" />}
        {msg && <div className="ok">{msg}</div>}
        <button disabled={uploading}>Submit complaint</button>
      </form>
      <h2>My complaints</h2>
      <List items={list} onOpen={setOpen} />
      {open && <Detail id={open} token={token} user={user} departments={[]}
        onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

function AdminView({ token, user }) {
  const [list, setList] = useState([]);
  const [stats, setStats] = useState(null);
  const [depts, setDepts] = useState([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(null);
  const load = () => {
    api("/complaints" + (filter ? `?status=${encodeURIComponent(filter)}` : ""), "GET", null, token).then(setList);
    api("/stats", "GET", null, token).then(setStats);
  };
  useEffect(() => { api("/departments", "GET", null, token).then(setDepts); }, []);
  useEffect(load, [filter]);

  return (
    <>
      {stats && (
        <div className="stats">
          <div className="card"><b>{stats.total}</b><span>Total</span></div>
          <div className="card"><b>{stats.by_status?.Submitted || 0}</b><span>New</span></div>
          <div className="card"><b>{stats.by_status?.["In Progress"] || 0}</b><span>In progress</span></div>
          <div className="card"><b>{stats.by_status?.Resolved || 0}</b><span>Resolved</span></div>
          <div className="card"><b className="overdue">{stats.overdue}</b><span>Overdue</span></div>
          <div className="card"><b>{stats.avg_resolution_hours ?? "–"}</b><span>Avg hrs to resolve</span></div>
          <div className="card"><b>{stats.avg_rating ?? "–"}</b><span>Avg rating</span></div>
        </div>
      )}
      {stats && (
        <div className="card">
          <h4>By category</h4>
          {Object.entries(stats.by_category).map(([k, v]) => (
            <div key={k} className="bar">
              <span>{k}</span>
              <div style={{ width: `${(v / stats.total) * 100}%` }} />
              <em>{v}</em>
            </div>
          ))}
        </div>
      )}
      <div className="bar-head">
        <h2>All complaints</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <List items={list} onOpen={setOpen} showUser />
      {open && <Detail id={open} token={token} user={user} departments={depts}
        onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem("auth")); } catch { return null; }
  });
  const save = (d) => { localStorage.setItem("auth", JSON.stringify(d)); setAuth(d); };
  const logout = () => { localStorage.removeItem("auth"); setAuth(null); };
  if (!auth) return <Auth onAuth={save} />;
  return (
    <>
      <header>
        <b>🏫 Campus Complaints</b>
        <span>{auth.user.name} ({auth.user.role}) <button onClick={logout}>Logout</button></span>
      </header>
      <main>
        {auth.user.role === "admin"
          ? <AdminView token={auth.token} user={auth.user} />
          : <UserView token={auth.token} user={auth.user} />}
      </main>
    </>
  );
}