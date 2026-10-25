import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./ui";

let gsiPromise;
function loadGsi() {
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => { gsiPromise = null; reject(new Error("Could not load Google sign-in")); };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

function GoogleButton({ onCredential }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [state, setState] = useState("loading");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const cfg = await api("/config");
        if (!cfg.google_client_id) return !dead && setState("off");
        await loadGsi();
        if (dead || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: (r) => cb.current(r.credential),
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: "outline", size: "large", text: "continue_with", shape: "rectangular",
          width: Math.min(380, box.current.offsetWidth || 380),
        });
        setState("ready");
      } catch {
        if (!dead) setState("error");
      }
    })();
    return () => { dead = true; };
  }, []);

  return (
    <div>
      <div ref={box} className="gbtn" />
      {state === "loading" && <div className="gskel">Loading Google sign-in...</div>}
      {state === "off" && <div className="hint">Google sign-in is not configured yet.</div>}
      {state === "error" && <div className="hint">Google sign-in could not load. Check your connection.</div>}
    </div>
  );
}

export default function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState("user"); // user | staff
  const [mode, setMode] = useState("login"); // login | register
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const finish = (d) => {
    if (tab === "staff" && !["staff", "admin"].includes(d.user.role)) {
      setErr("This account is not a department admin account. Use the Student / Staff tab.");
      return;
    }
    onAuth(d);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const d = mode === "login" || tab === "staff"
        ? await api("/auth/login", "POST", { email: f.email, password: f.password })
        : await api("/auth/register", "POST", f);
      finish(d);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async (credential) => {
    setErr("");
    try {
      finish(await api("/auth/google", "POST", { credential }));
    } catch (x) {
      setErr(x.message);
    }
  };

  const registering = tab === "user" && mode === "register";

  return (
    <div className="auth-wrap">
      <aside className="auth-brand">
        <div className="brand-row">
          <div className="brand-logo"><Icon name="shield" size={20} /></div>
          <b>Campus Resolve</b>
        </div>
        <h1>Report it once.<br />Watch it get fixed.</h1>
        <p>A transparent grievance system for your campus. Every complaint gets a ticket, reaches the right department and is tracked until it is resolved.</p>
        <ul>
          <li><Icon name="check" size={16} /> Instant ticket ID and smart department routing</li>
          <li><Icon name="check" size={16} /> Live status with a full history trail</li>
          <li><Icon name="check" size={16} /> Deadlines (SLA) and overdue alerts</li>
        </ul>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-logo"><Icon name="shield" size={20} /></div>
            <b>Campus Resolve</b>
          </div>
          <h2>{registering ? "Create your account" : "Welcome back"}</h2>
          <p className="muted">
            {tab === "staff"
              ? "Department admins sign in with the email and password given by the Super Admin."
              : "Sign in to report an issue or track your complaints."}
          </p>

          <div className="seg">
            <button className={tab === "user" ? "on" : ""} onClick={() => { setTab("user"); setErr(""); }}>Student / Staff</button>
            <button className={tab === "staff" ? "on" : ""} onClick={() => { setTab("staff"); setMode("login"); setErr(""); }}>Department admin</button>
          </div>

          {tab === "user" && (
            <>
              <GoogleButton onCredential={google} />
              <div className="or"><span>or use email</span></div>
            </>
          )}

          <form onSubmit={submit} className="form">
            {registering && (
              <div className="field">
                <label>Full name</label>
                <input required placeholder="Your name" value={f.name} onChange={set("name")} />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input type="email" required placeholder="you@example.com" value={f.email} onChange={set("email")} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required minLength={registering ? 6 : undefined}
                placeholder={registering ? "At least 6 characters" : "Your password"}
                value={f.password} onChange={set("password")} />
            </div>
            {err && <div className="alert err">{err}</div>}
            <button className="btn block" disabled={busy}>
              {busy ? "Please wait..." : registering ? "Create account" : "Sign in"}
            </button>
          </form>

          {tab === "user" && (
            <p className="switch">
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <a onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
                {mode === "login" ? "Create an account" : "Sign in"}
              </a>
            </p>
          )}
          {tab === "staff" && (
            <p className="hint center">Need access? Ask the Super Admin to add your email to your department.</p>
          )}
        </div>
      </main>
    </div>
  );
}
