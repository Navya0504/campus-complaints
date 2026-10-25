import { useEffect, useState } from "react";
import { api } from "./api";
import { Drawer, Icon, StatusBadge, PriorityBadge, Stars, fmt, STATUSES } from "./ui";

export default function ComplaintDrawer({ id, token, user, departments, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [note, setNote] = useState("");
  const [members, setMembers] = useState([]);
  const [assignee, setAssignee] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = user.role === "admin";
  const isStaff = user.role === "staff";

  const load = async () => {
    const d = await api(`/complaints/${id}`, "GET", null, token);
    setC(d);
    setStatus(d.status);
    setDept(String(d.department_id));
    setAssignee(d.assigned_to_id ? String(d.assigned_to_id) : "");
    return d;
  };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (isAdmin) api("/team", "GET", null, token).then(setMembers).catch(() => {});
  }, [id]);

  const act = async (fn) => {
    setErr(""); setBusy(true);
    try { await fn(); onChanged(); await load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const claim = () => act(() => api(`/complaints/${id}/claim`, "POST", null, token));
  const release = () => act(() => api(`/complaints/${id}/release`, "POST", null, token));
  const save = () => act(async () => {
    await api(`/complaints/${id}/status`, "PATCH", { status, note, department_id: Number(dept) }, token);
    setNote("");
  });
  const assign = () => act(() => api(`/complaints/${id}/assign`, "PATCH",
    { user_id: assignee ? Number(assignee) : null }, token));
  const sendFeedback = () => act(() => api(`/complaints/${id}/feedback`, "POST", { rating, comment }, token));

  const viewOnlyReason = () => {
    if (!c || !isStaff || c.can_update || c.can_claim) return null;
    if (c.department_id !== user.department_id)
      return `This complaint belongs to ${c.department}. You can view it, but only ${c.department} staff can work on it.`;
    if (c.assigned_to_id) return `${c.assigned_to} is handling this complaint. You can view it, but only ${c.assigned_to} can update it.`;
    return "This complaint is closed.";
  };
  const reason = viewOnlyReason();
  const teamHere = members.filter((m) => c && m.department_id === c.department_id);

  return (
    <Drawer title={c ? c.ticket_id : "Ticket"} onClose={onClose}>
      {!c ? (
        <p className="muted">{err || "Loading..."}</p>
      ) : (
        <>
          <div>
            <div className="row-flex">
              <StatusBadge s={c.status} />
              <PriorityBadge p={c.priority} />
              {c.is_overdue && <span className="pill overdue">Overdue</span>}
            </div>
            <h3 className="d-title">{c.title}</h3>
            <p className="d-desc">{c.description}</p>
            {c.image_url && (
              <a href={c.image_url} target="_blank" rel="noreferrer">
                <img src={c.image_url} alt="Attached to complaint" className="d-img" />
              </a>
            )}
          </div>

          <div className="card flat meta">
            <div><small>Category</small>{c.category}</div>
            <div><small>Department</small>{c.department}</div>
            <div><small>Location</small>{c.location || "-"}</div>
            <div><small>Submitted by</small>{c.submitted_by}</div>
            <div><small>Raised</small>{fmt(c.created_at)}</div>
            <div><small>{c.resolved_at ? "Closed" : "Due by"}</small>{fmt(c.resolved_at || c.due_at)}</div>
            {user.role !== "user" && (
              <div className="span2"><small>Handled by</small>
                {c.assigned_to ? <b>{c.assigned_to}</b> : <span className="muted">Not taken yet (department queue)</span>}</div>
            )}
          </div>

          {reason && (
            <div className="banner info">
              <Icon name="lock" size={18} />
              <div>{reason}</div>
            </div>
          )}

          {c.can_claim && (
            <div className="card flat form">
              <h4>Waiting in your department's queue</h4>
              <p className="muted">Take this complaint to work on it. Once you take it, only you can update it.</p>
              <button className="btn" onClick={claim} disabled={busy}>
                <Icon name="user" size={16} /> {busy ? "Please wait..." : "Take this complaint"}
              </button>
            </div>
          )}

          {c.can_update && (
            <div className="card flat form">
              <h4>Update this ticket</h4>
              <div className="chips">
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{s}</button>
                ))}
              </div>
              <div className="field">
                <label>Forward to another department (optional)</label>
                <select value={dept} onChange={(e) => setDept(e.target.value)}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Note for the history (optional)</label>
                <input placeholder="e.g. Technician visited, part ordered" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="row-flex">
                <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
                {c.can_release && (
                  <button className="btn ghost" onClick={release} disabled={busy}>Release to queue</button>
                )}
              </div>
            </div>
          )}

          {isAdmin && c.can_assign && (
            <div className="card flat form">
              <h4>Assign to a team member</h4>
              <div className="field">
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned (department queue)</option>
                  {teamHere.map((m) => <option key={m.id} value={m.id}>{m.name}{m.title ? ` · ${m.title}` : ""}</option>)}
                </select>
                {teamHere.length === 0 && <span className="hint">No staff in {c.department} yet. Add some under Manage staff.</span>}
              </div>
              <button className="btn ghost" onClick={assign} disabled={busy}>Save assignment</button>
            </div>
          )}

          <div>
            <h4>Status history</h4>
            <ul className="timeline">
              {c.history.map((h, i) => (
                <li key={i}>
                  <b>{h.status}</b>
                  <div className="muted sm">{h.changed_by} · {fmt(h.changed_at)}</div>
                  {h.note && <div className="note">{h.note}</div>}
                </li>
              ))}
            </ul>
          </div>

          {user.role === "user" && c.status === "Resolved" && !c.feedback && (
            <div className="card flat form">
              <h4>How did we do?</h4>
              <Stars value={rating} onChange={setRating} />
              <div className="field">
                <input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button className="btn" onClick={sendFeedback} disabled={busy}>Submit feedback</button>
            </div>
          )}

          {c.feedback && (
            <div className="card flat">
              <h4>Feedback</h4>
              <Stars value={c.feedback.rating} />
              {c.feedback.comment && <p>{c.feedback.comment}</p>}
            </div>
          )}

          {err && <div className="alert err">{err}</div>}
        </>
      )}
    </Drawer>
  );
}
