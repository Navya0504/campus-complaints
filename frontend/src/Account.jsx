import { useState } from "react";
import { api } from "./api";
import { Avatar, Drawer, ROLE_LABEL } from "./ui";

export default function AccountModal({ auth, onClose, onUpdated }) {
  const u = auth.user;
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

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
