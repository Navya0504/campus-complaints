import { useState } from "react";
import { api } from "./api";
import { Avatar, Drawer, ROLE_LABEL } from "./ui";

export default function AccountModal({ auth, onClose, onUpdated }) {
  const u = auth.user;
  const isStaff = u.role === "staff";

  const [name, setName] = useState(u.name);
  const [title, setTitle] = useState(u.title || "");
  const [pErr, setPErr] = useState("");
  const [pOk, setPOk] = useState("");
  const [pBusy, setPBusy] = useState(false);

  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setPErr(""); setPOk(""); setPBusy(true);
    try {
      const body = { name };
      if (isStaff) body.title = title;
      const user = await api("/auth/profile", "PATCH", body, auth.token);
      onUpdated(user);
      setPOk("Profile saved.");
    } catch (x) {
      setPErr(x.message);
    } finally {
      setPBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setOk("");
    if (pw !== pw2) return setErr("The two passwords do not match.");
    setBusy(true);
    try {
      const user = await api("/auth/set-password", "POST",
        { password: pw, current_password: u.has_password ? cur : null }, auth.token);
      onUpdated(user);
      setCur(""); setPw(""); setPw2("");
      setOk(u.has_password ? "Password changed." : "Password set. You can now also sign in with your email and password.");
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer center title="My account" onClose={onClose}>
      <div className="profile">
        <Avatar name={u.name} size={52} />
        <div>
          <b>{u.name}</b>
          <div className="muted">{u.email}</div>
          <div className="muted">{ROLE_LABEL[u.role]}{u.department ? ` · ${u.department}` : ""}</div>
        </div>
      </div>

      <form onSubmit={saveProfile} className="form">
        <h3>My details</h3>
        <div className="field"><label>Full name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        {isStaff && (
          <div className="field"><label>My role in the department</label>
            <input placeholder="e.g. Network Engineer, Electrician" maxLength={80} value={title}
              onChange={(e) => setTitle(e.target.value)} />
            <span className="hint">Your colleagues can see this on the Team page. Only you can change it.</span></div>
        )}
        {pErr && <div className="alert err">{pErr}</div>}
        {pOk && <div className="alert ok">{pOk}</div>}
        <button className="btn ghost" disabled={pBusy}>{pBusy ? "Saving..." : "Save details"}</button>
      </form>

      <form onSubmit={submit} className="form">
        <h3>{u.has_password ? "Change password" : "Create a password"}</h3>
        {!u.has_password && (
          <p className="muted">You signed in with Google. Add a password if you also want to sign in with your email.</p>
        )}
        {u.has_password && (
          <div className="field"><label>Current password</label>
            <input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        )}
        <div className="field"><label>New password</label>
          <input type="password" required minLength={6} placeholder="At least 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="field"><label>Confirm new password</label>
          <input type="password" required minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {err && <div className="alert err">{err}</div>}
        {ok && <div className="alert ok">{ok}</div>}
        <button className="btn" disabled={busy}>{busy ? "Saving..." : u.has_password ? "Change password" : "Set password"}</button>
      </form>
    </Drawer>
  );
}
