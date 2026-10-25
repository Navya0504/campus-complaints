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
  const [mode, setMode] = useState("login"); // login | register (students only)
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [depts, setDepts] = useState([]);
  const [dept, setDept] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/public/departments").then(setDepts).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const deptName = (id) => depts.find((d) => String(d.id) === String(id))?.name;
  const switchTab = (t) => { setTab(t); setMode("login"); setErr(""); };

  // Decides whether this sign-in is allowed on the tab the person is using.
  const finish = (d) => {
    const role = d.user.role;
    if (tab === "user") {
      if (role !== "user") return setErr("This is a department staff account. Please use the Department login tab.");
      return onAuth(d);
    }
    if (dept === "admin") {
      if (role !== "admin") return setErr("This account is not the Super Admin.");
      return onAuth(d);
    }
    if (role !== "staff") {
      return setErr("This account has not been added as department staff. Ask the Super Admin to add you.");
    }
    if (String(d.user.department_id) !== String(dept)) {
      return setErr(`You are not a member of ${deptName(dept)}. Select the department you were added to.`);
    }
    onAuth(d);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (tab === "staff" && !dept) return setErr("Select your department first.");
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
    if (tab === "staff" && !dept) return setErr("Select your department first, then continue with Google.");
    try {
      finish(await api("/auth/google", "POST", { credential, staff_login: tab === "staff" }));
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
          <li><Icon name="check" size={16} /> Each complaint handled by one named person</li>
          <li><Icon name="check" size={16} /> Live status with a full history trail</li>
        </ul>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-logo"><Icon name="shield" size={20} /></div>
            <b>Campus Resolve</b>
          </div>
          <h2>{registering ? "Create your account" : tab === "staff" ? "Department login" : "Welcome back"}</h2>
          <p className="muted">
            {tab === "staff"
              ? "For professors and staff who resolve complaints. Choose your department, then sign in."
              : "Sign in to report an issue or track your complaints."}
          </p>

          <div className="seg">
            <button className={tab === "user" ? "on" : ""} onClick={() => switchTab("user")}>Student / Staff</button>
            <button className={tab === "staff" ? "on" : ""} onClick={() => switchTab("staff")}>Department login</button>
          </div>

          {tab === "staff" && (
            <div className="field">
              <label>Your department</label>
              <select value={dept} onChange={(e) => { setDept(e.target.value); setErr(""); }}>
                <option value="">Select your department</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="admin">Super Admin (all departments)</option>
              </select>
            </div>
          )}

          <GoogleButton onCredential={google} />
          <div className="or"><span>or use email</span></div>

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
            <p className="hint center">
              The Super Admin adds you to your department and gives you a password. You can sign in with that password, or with
              Google using the same email. Forgot it? Ask the Super Admin to reset it.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
