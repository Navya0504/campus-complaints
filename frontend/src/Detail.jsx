import { useEffect, useState } from "react";
import { api } from "./api";
import { Drawer, StatusBadge, PriorityBadge, Stars, fmt, STATUSES } from "./ui";

export default function ComplaintDrawer({ id, token, user, departments, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isStaff = user.role !== "user";

  const load = async () => {
    const d = await api(`/complaints/${id}`, "GET", null, token);
    setC(d);
    setStatus(d.status);
    setDept(String(d.department_id));
  };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [id]);

  const save = async () => {
    setErr(""); setBusy(true);
    try {
      await api(`/complaints/${id}/status`, "PATCH",
        { status, note, department_id: Number(dept) }, token);
      setNote("");
      onChanged();
      const left = user.role === "staff" && Number(dept) !== user.department_id;
      if (left) return onClose(); // forwarded away from this department
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const sendFeedback = async () => {
    setErr(""); setBusy(true);
    try {
      await api(`/complaints/${id}/feedback`, "POST", { rating, comment }, token);
      await load();
      onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

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
          </div>

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

          {isStaff && (
            <div className="card flat form">
              <h4>Update this ticket</h4>
              <div className="chips">
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={status === s ? "on" : ""} onClick={() => setStatus(s)}>{s}</button>
                ))}
              </div>
              <div className="field">
                <label>Assign / forward to department</label>
                <select value={dept} onChange={(e) => setDept(e.target.value)}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Note for the history (optional)</label>
                <input placeholder="e.g. Technician assigned" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
            </div>
          )}

          {!isStaff && c.status === "Resolved" && !c.feedback && (
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
