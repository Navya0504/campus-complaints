import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import {
  Icon, Avatar, StatusBadge, PriorityBadge, Stat, Empty, BarList, fmt, fmtDate, STATUSES, PRIORITIES,
} from "./ui";

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD;
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

const isOpen = (c) => c.status === "Submitted" || c.status === "In Progress";

/* ---------- shared table ---------- */
export function ComplaintTable({ items, onOpen, showUser, showDept = true, showHandler = false, markReadOnly = false }) {
  if (!items.length) return <Empty title="No complaints found" text="Nothing matches right now." />;
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th><th>Issue</th><th>Category</th>
            {showDept && <th>Department</th>}
            {showHandler && <th>Handled by</th>}
            <th>Priority</th><th>Status</th><th>Raised</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const readOnly = markReadOnly && !c.can_update && !c.can_claim;
            return (
              <tr key={c.id} className={"click" + (readOnly ? " dim" : "")} onClick={() => onOpen(c.id)}>
                <td data-label="Ticket">
                  <b>{c.ticket_id}</b>
                  {readOnly && <span className="lock" title="View only"><Icon name="lock" size={13} /></span>}
                </td>
                <td data-label="Issue" className="issue">
                  <div className="t">{c.title}</div>
                  {showUser && <div className="muted sm">by {c.submitted_by}</div>}
                </td>
                <td data-label="Category">{c.category}</td>
                {showDept && <td data-label="Department">{c.department}</td>}
                {showHandler && (
                  <td data-label="Handled by">
                    {c.assigned_to ? c.assigned_to
                      : isOpen(c) ? <span className="pill queue">In queue</span> : <span className="muted">-</span>}
                  </td>
                )}
                <td data-label="Priority"><PriorityBadge p={c.priority} /></td>
                <td data-label="Status">
                  <div className="row-flex end">
                    <StatusBadge s={c.status} />
                    {c.is_overdue && <span className="pill overdue">Overdue</span>}
                  </div>
                </td>
                <td data-label="Raised" className="muted">{fmtDate(c.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniList({ items, onOpen, empty }) {
  if (!items.length) return <p className="muted">{empty || "Nothing here."}</p>;
  return (
    <div className="mini">
      {items.map((c) => (
        <div className="mini-row" key={c.id} onClick={() => onOpen(c.id)}>
          <div>
            <b>{c.ticket_id}</b> · {c.title}
            <div className="muted sm">{c.category} · {c.department} · due {fmtDate(c.due_at)}</div>
          </div>
          <div className="row-flex end">
            <PriorityBadge p={c.priority} />
            <StatusBadge s={c.status} />
            {c.is_overdue && <span className="pill overdue">Overdue</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- complaints list with filters (all roles) ---------- */
export function ComplaintsPage({ token, user, departments, onOpen, tick, title, subtitle }) {
  const role = user.role;
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [dept, setDept] = useState("");
  const [scope, setScope] = useState("dept"); // staff only: dept | all

  useEffect(() => {
    setItems(null);
    api("/complaints" + (role === "staff" ? `?scope=${scope}` : ""), "GET", null, token)
      .then(setItems).catch((e) => setErr(e.message));
  }, [tick, scope]);

  const tabs = role === "staff" ? ["All", "Unassigned", "Mine", ...STATUSES, "Overdue"]
    : role === "admin" ? ["All", "Unassigned", ...STATUSES, "Overdue"]
    : ["All", ...STATUSES];

  const all = items || [];
  const cats = useMemo(() => [...new Set(all.map((c) => c.category))].sort(), [items]);
  const match = (c, t) =>
    t === "All" ? true
      : t === "Overdue" ? c.is_overdue
      : t === "Unassigned" ? isOpen(c) && !c.assigned_to_id
      : t === "Mine" ? c.assigned_to_id === user.id
      : c.status === t;
  const count = (t) => all.filter((c) => match(c, t)).length;

  const shown = all.filter((c) => {
    if (!match(c, tab)) return false;
    if (category && c.category !== category) return false;
    if (priority && c.priority !== priority) return false;
    if (dept && String(c.department_id) !== dept) return false;
    if (q) {
      const hay = `${c.ticket_id} ${c.title} ${c.description} ${c.location} ${c.submitted_by} ${c.assigned_to || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const showDeptFilter = role === "admin" || (role === "staff" && scope === "all");

  return (
    <>
      <div className="page-head">
        <div><h1>{title}</h1><p className="sub">{subtitle}</p></div>
        {role === "staff" && (
          <div className="seg inline">
            <button className={scope === "dept" ? "on" : ""} onClick={() => { setScope("dept"); setDept(""); setTab("All"); }}>My department</button>
            <button className={scope === "all" ? "on" : ""} onClick={() => { setScope("all"); setTab("All"); }}>All departments</button>
          </div>
        )}
      </div>

      {role === "staff" && scope === "all" && (
        <div className="banner info">
          <Icon name="eye" size={18} />
          <div>You are viewing every department. You can open any complaint, but you can only work on complaints of your own department.</div>
        </div>
      )}

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t} <span>{count(t)}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input placeholder="Search ticket, title, location, person..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        {showDeptFilter && (
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>
      {err && <div className="alert err">{err}</div>}
      {items === null && !err ? <p className="muted">Loading...</p>
        : <ComplaintTable items={shown} onOpen={onOpen} showUser={role !== "user"}
            showDept={role === "admin" || (role === "staff" && scope === "all")}
            showHandler={role !== "user"} markReadOnly={role === "staff"} />}
    </>
  );
}

/* ---------- student / staff member who reports issues ---------- */
export function UserOverview({ auth, tick, go, onOpen, openAccount }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api("/complaints", "GET", null, auth.token).then(setItems).catch(() => setItems([])); }, [tick]);
  const all = items || [];
  const open = all.filter(isOpen).length;
  const first = auth.user.name.split(" ")[0];

  return (
    <>
      <div className="page-head">
        <div><h1>Hello, {first}</h1><p className="sub">Here is where your complaints stand.</p></div>
        <button className="btn" onClick={() => go("new")}><Icon name="plus" size={16} /> New complaint</button>
      </div>

      {!auth.user.has_password && (
        <div className="banner">
          <div><b>Add a password</b><div className="sm">You signed in with Google. Set a password to also sign in with your email.</div></div>
          <button className="btn sm" onClick={openAccount}><Icon name="key" size={14} /> Set password</button>
        </div>
      )}

      <div className="grid stats">
        <Stat icon="doc" label="Total complaints" value={all.length} />
        <Stat icon="clock" tone="amber" label="Open" value={open} />
        <Stat icon="check" tone="green" label="Resolved" value={all.filter((c) => c.status === "Resolved").length} />
        <Stat icon="alert" tone="red" label="Rejected" value={all.filter((c) => c.status === "Rejected").length} />
      </div>

      <div className="section-head"><h2>Recent complaints</h2>
        {all.length > 0 && <a onClick={() => go("mine")}>View all</a>}</div>
      {items === null ? <p className="muted">Loading...</p> : all.length === 0 ? (
        <Empty title="No complaints yet" text="Spotted something broken on campus? Report it and track it here.">
          <button className="btn" onClick={() => go("new")}>Report an issue</button>
        </Empty>
      ) : <div className="card"><MiniList items={all.slice(0, 5)} onOpen={onOpen} /></div>}
    </>
  );
}

export function NewComplaint({ token, onCreated, go, onOpen }) {
  const empty = { title: "", description: "", category: "", location: "", image_url: "" };
  const [cats, setCats] = useState([]);
  const [f, setF] = useState(empty);
  const [sug, setSug] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const file = useRef(null);

  useEffect(() => { api("/categories").then(setCats).catch(() => {}); }, []);

  useEffect(() => {
    const text = `${f.title} ${f.description}`.trim();
    if (text.length < 8) return setSug(null);
    const t = setTimeout(() => api("/suggest", "POST", { text }).then(setSug).catch(() => {}), 450);
    return () => clearTimeout(t);
  }, [f.title, f.description]);

  const upload = async (picked) => {
    if (!picked) return;
    if (!CLOUD || !PRESET) return setErr("Image upload is not configured (Cloudinary settings missing).");
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", picked);
      fd.append("upload_preset", PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.secure_url) throw new Error(d.error?.message || "Upload failed");
      setF((p) => ({ ...p, image_url: d.secure_url }));
    } catch (e) { setErr(e.message); } finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const c = await api("/complaints", "POST",
        { ...f, category: f.category || null, image_url: f.image_url || null }, token);
      setDone(c); setF(empty); onCreated();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="card success">
        <div className="success-ico"><Icon name="check" size={28} /></div>
        <h2>Complaint submitted</h2>
        <p className="muted">Your ticket number is</p>
        <div className="ticket">{done.ticket_id}</div>
        <p className="muted">Routed to <b>{done.department}</b> · {done.category} · {done.priority} priority<br />
          Expected resolution by {fmt(done.due_at)}</p>
        <div className="row-flex center">
          <button className="btn ghost" onClick={() => onOpen(done.id)}>View ticket</button>
          <button className="btn ghost" onClick={() => go("mine")}>My complaints</button>
          <button className="btn" onClick={() => setDone(null)}>Report another</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head"><div><h1>New complaint</h1>
        <p className="sub">Describe the issue. We will route it to the right department automatically.</p></div></div>
      <form className="card form cols" onSubmit={submit}>
        <div className="field span2">
          <label>Title</label>
          <input required placeholder="e.g. Wi-Fi not working in library" value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="field span2">
          <label>Description</label>
          <textarea required rows={4} placeholder="What is wrong, since when, and who is affected?" value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Auto-detect</option>
            {cats.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Location</label>
          <input placeholder="Block / floor / room" value={f.location}
            onChange={(e) => setF({ ...f, location: e.target.value })} />
        </div>

        {sug && (
          <div className="suggest span2">
            <Icon name="spark" size={16} />
            <span>
              Detected {f.category ? "" : <b>{sug.category}</b>}
              {f.category ? <>priority <b>{sug.priority}</b></> : <> · priority <b>{sug.priority}</b> · goes to <b>{sug.department}</b></>}
            </span>
          </div>
        )}

        <div className="field span2">
          <label>Photo (optional)</label>
          {f.image_url ? (
            <div className="preview">
              <img src={f.image_url} alt="Preview" />
              <button type="button" className="btn ghost sm" onClick={() => setF({ ...f, image_url: "" })}>Remove</button>
            </div>
          ) : (
            <div className="drop" onClick={() => file.current.click()}>
              <Icon name="image" size={22} />
              <div>{uploading ? "Uploading..." : "Click to add a photo"}</div>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
            </div>
          )}
        </div>

        {err && <div className="alert err span2">{err}</div>}
        <div className="span2 actions">
          <button className="btn" disabled={busy || uploading}>{busy ? "Submitting..." : "Submit complaint"}</button>
        </div>
      </form>
    </>
  );
}

/* ---------- department staff + super admin ---------- */
export function StaffOverview({ auth, tick, go, onOpen }) {
  const [s, setS] = useState(null);
  const [items, setItems] = useState([]);
  useEffect(() => {
    api("/stats", "GET", null, auth.token).then(setS).catch(() => {});
    api("/complaints", "GET", null, auth.token).then(setItems).catch(() => {});
  }, [tick]);

  const isAdmin = auth.user.role === "admin";
  const me = auth.user.id;
  const byDue = (a, b) => a.due_at.localeCompare(b.due_at);
  const queue = items.filter((c) => isOpen(c) && !c.assigned_to_id).sort(byDue).slice(0, 6);
  const mine = items.filter((c) => isOpen(c) && c.assigned_to_id === me).sort(byDue).slice(0, 6);
  const attention = items.filter((c) => isOpen(c) && (c.is_overdue || c.priority === "Urgent")).sort(byDue).slice(0, 6);
  const maxDay = s ? Math.max(...s.last7.map((d) => d.count), 1) : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? "Campus overview" : `${auth.user.department} dashboard`}</h1>
          <p className="sub">{isAdmin ? "All departments" : `Hello ${auth.user.name.split(" ")[0]}. Take a complaint from the queue to start working on it.`}</p>
        </div>
        <button className="btn" onClick={() => go("complaints")}>Open complaints</button>
      </div>

      {!s ? <p className="muted">Loading...</p> : (
        <>
          <div className="grid stats">
            {!isAdmin && <Stat icon="user" tone="blue" label="My open work" value={s.mine_open} />}
            {!isAdmin && <Stat icon="check" tone="green" label="Resolved by me" value={s.mine_resolved} />}
            <Stat icon="inbox" tone="slate" label="Waiting in queue" value={s.unassigned} />
            <Stat icon="doc" label={isAdmin ? "Total" : "Department total"} value={s.total} />
            <Stat icon="clock" tone="amber" label="In progress" value={s.by_status["In Progress"] || 0} />
            {isAdmin && <Stat icon="check" tone="green" label="Resolved" value={s.by_status.Resolved || 0} />}
            <Stat icon="alert" tone="red" label="Overdue" value={s.overdue} />
            <Stat icon="clock" tone="blue" label="Avg hours to resolve" value={s.avg_resolution_hours ?? "-"} />
            <Stat icon="star" tone="amber" label={`Avg rating${s.rating_count ? ` (${s.rating_count})` : ""}`} value={s.avg_rating ?? "-"} />
          </div>

          <div className="grid two">
            <div className="card">
              <h3>Complaints, last 7 days</h3>
              <div className="trend">
                {s.last7.map((d) => (
                  <div className="col" key={d.date}>
                    <small>{d.count}</small>
                    <div className="bar" style={{ height: `${(d.count / maxDay) * 100}%` }} />
                    <small>{d.label}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="card"><h3>By category</h3><BarList data={s.by_category} /></div>
          </div>

          <div className="grid two">
            <div className="card"><h3>By priority</h3><BarList data={s.by_priority} tone="amber" /></div>
            {isAdmin
              ? <div className="card"><h3>By department</h3><BarList data={s.by_department} tone="green" /></div>
              : <div className="card"><h3>By status</h3><BarList data={s.by_status} tone="green" /></div>}
          </div>
        </>
      )}

      {!isAdmin && (
        <>
          <div className="section-head"><h2>My work</h2><span className="muted sm">Complaints you have taken</span></div>
          <div className="card"><MiniList items={mine} onOpen={onOpen} empty="You have not taken any complaint yet." /></div>
          <div className="section-head"><h2>Department queue</h2><span className="muted sm">Open complaints nobody has taken yet</span></div>
          <div className="card"><MiniList items={queue} onOpen={onOpen} empty="The queue is empty. Great job!" /></div>
        </>
      )}
      {isAdmin && (
        <>
          <div className="section-head"><h2>Needs attention</h2><span className="muted sm">Overdue or urgent, still open</span></div>
          <div className="card"><MiniList items={attention} onOpen={onOpen} empty="Nothing urgent. Everything is on track." /></div>
        </>
      )}
    </>
  );
}

/* ---------- team (read-only for everyone except your own profile) ---------- */
export function TeamPage({ auth, tick, onOpen, onEditProfile }) {
  const [team, setTeam] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/team", "GET", null, auth.token).then(setTeam).catch((e) => setErr(e.message)); }, [tick]);

  const isAdmin = auth.user.role === "admin";
  const groups = {};
  (team || []).forEach((m) => { (groups[m.department] = groups[m.department] || []).push(m); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? "Department teams" : `${auth.user.department} team`}</h1>
          <p className="sub">{isAdmin
            ? "Everyone who resolves complaints, by department."
            : "Your colleagues and what they are working on. You can edit only your own details."}</p>
        </div>
      </div>
      {err && <div className="alert err">{err}</div>}
      {team === null && !err && <p className="muted">Loading...</p>}
      {team && team.length === 0 && (
        <Empty title="No team members yet" text={isAdmin ? "Add staff under Manage staff." : "Ask the Super Admin to add your colleagues."} />
      )}
      {Object.entries(groups).map(([dept, members]) => (
        <div key={dept}>
          {isAdmin && <div className="section-head"><h2>{dept}</h2><span className="muted sm">{members.length} member{members.length > 1 ? "s" : ""}</span></div>}
          <div className="grid team">
            {members.map((m) => (
              <div key={m.id} className={"card member" + (m.is_me ? " me" : "")}>
                <div className="row-flex">
                  <Avatar name={m.name} size={44} />
                  <div>
                    <b>{m.name}</b> {m.is_me && <span className="pill you">You</span>}
                    <div className="muted sm">{m.title || "Role not set"}</div>
                  </div>
                </div>
                <div className="muted sm">{m.email}</div>
                <div className="counts">
                  <span><b>{m.open_count}</b> open</span>
                  <span><b>{m.resolved_count}</b> resolved</span>
                </div>
                {m.working_on.length > 0 ? (
                  <div className="working">
                    <small>Working on</small>
                    {m.working_on.map((w) => (
                      <a key={w.id} onClick={() => onOpen(w.id)}>{w.ticket_id} · {w.title}</a>
                    ))}
                  </div>
                ) : <p className="muted sm">Not working on anything right now.</p>}
                {m.is_me && <button className="btn ghost sm" onClick={onEditProfile}><Icon name="user" size={14} /> Edit my profile</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------- Super Admin: add and manage staff ---------- */
export function ManageStaff({ token, departments, tick }) {
  const [staff, setStaff] = useState(null);
  const [f, setF] = useState({ name: "", email: "", password: "", department_id: "", title: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [newPw, setNewPw] = useState("");

  const load = () => api("/staff", "GET", null, token).then(setStaff).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tick]);
  useEffect(() => {
    if (!f.department_id && departments.length) setF((p) => ({ ...p, department_id: String(departments[0].id) }));
  }, [departments]);

  const add = async (e) => {
    e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    try {
      const s = await api("/staff", "POST", { ...f, department_id: Number(f.department_id) }, token);
      setOk(`${s.name} can now sign in under ${s.department} with ${s.email}. Share the temporary password with them.`);
      setF({ ...f, name: "", email: "", password: "", title: "" });
      load();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const changeDept = async (s, department_id) => {
    if (s.open_count > 0 && !window.confirm(
      `${s.name} has ${s.open_count} open complaint(s). They will go back to the queue of the old department. Continue?`)) return;
    setErr("");
    try { await api(`/staff/${s.id}`, "PATCH", { department_id: Number(department_id) }, token); load(); }
    catch (x) { setErr(x.message); }
  };
  const reset = async (id) => {
    setErr(""); setOk("");
    try {
      await api(`/staff/${id}`, "PATCH", { password: newPw }, token);
      setResetId(null); setNewPw(""); setOk("Password updated. Share it with the staff member.");
    } catch (x) { setErr(x.message); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.name} from ${s.department}? Their open complaints return to the queue and their account becomes a normal user.`)) return;
    try { await api(`/staff/${s.id}`, "DELETE", null, token); load(); } catch (x) { setErr(x.message); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Manage staff</h1>
        <p className="sub">Add the professors and staff who resolve complaints. Each person gets their own login and sees only their department's work.</p></div></div>

      <form className="card form cols" onSubmit={add}>
        <h3 className="span2">Add a staff member</h3>
        <div className="field"><label>Full name</label>
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Email (their login, Google or college email)</label>
          <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Department</label>
          <select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
        <div className="field"><label>Temporary password</label>
          <input required minLength={6} placeholder="At least 6 characters" value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })} />
          <span className="hint">They can change it after signing in.</span></div>
        <div className="field span2"><label>Role (optional)</label>
          <input placeholder="e.g. Network Engineer. The member can change this themselves." maxLength={80} value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        {err && <div className="alert err span2">{err}</div>}
        {ok && <div className="alert ok span2">{ok}</div>}
        <div className="span2 actions"><button className="btn" disabled={busy}>{busy ? "Adding..." : "Add staff member"}</button></div>
      </form>

      <div className="section-head"><h2>Staff</h2></div>
      {staff === null ? <p className="muted">Loading...</p> : staff.length === 0 ? (
        <Empty title="No staff added yet" text="Add a person above so each department can resolve its own complaints." />
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Work</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td data-label="Name"><b>{s.name}</b><div className="muted sm">{s.email}</div></td>
                  <td data-label="Role" className="muted">{s.title || "-"}</td>
                  <td data-label="Department">
                    <select className="inline" value={s.department_id || ""} onChange={(e) => changeDept(s, e.target.value)}>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td data-label="Work" className="muted">{s.open_count} open · {s.resolved_count} resolved</td>
                  <td data-label="Actions">
                    {resetId === s.id ? (
                      <div className="row-flex end">
                        <input className="inline" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                        <button className="btn sm" disabled={newPw.length < 6} onClick={() => reset(s.id)}>Save</button>
                        <button className="btn ghost sm" onClick={() => { setResetId(null); setNewPw(""); }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="row-flex end">
                        <button className="btn ghost sm" onClick={() => setResetId(s.id)}><Icon name="key" size={14} /> Reset password</button>
                        <button className="btn danger sm" onClick={() => remove(s)}><Icon name="trash" size={14} /> Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
