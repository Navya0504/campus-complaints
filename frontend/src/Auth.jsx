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

const IS_APP = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

// Google sign-in inside the Android app: Google's own account picker, no browser needed.
function NativeGoogleButton({ onCredential, onError }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      const cfg = await api("/config");
      if (!cfg.google_client_id) throw new Error("Google sign-in is not configured on the server.");
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.initialize({ google: { webClientId: cfg.google_client_id } });
      const { result } = await SocialLogin.login({ provider: "google", options: {} });
      if (!result?.idToken) throw new Error("Google did not return a sign-in token. Please try again.");
      await onCredential(result.idToken);
    } catch (x) {
      const m = String(x?.message || x || "");
      if (/cancel/i.test(m)) return;
      onError(/28444|developer console|not set up/i.test(m)
        ? "Google sign-in is not set up for this app build yet (Android client / SHA-1 mismatch)."
        : m || "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn ghost block gnative" onClick={click} disabled={busy}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
        <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/>
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
      </svg>
      {busy ? "Opening Google..." : "Continue with Google"}
    </button>
  );
}

export default function AuthScreen({ onAuth }) {
  const isApp = IS_APP();
  const [tab, setTab] = useState("user"); // user | staff
  const [mode, setMode] = useState("login"); // login | register (students only)
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [depts, setDepts] = useState([]);
  const [deptState, setDeptState] = useState("loading"); // loading | ready | error
  const [dept, setDept] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDepts = () => {
    setDeptState("loading");
    api("/public/departments")
      .then((d) => { setDepts(d); setDeptState(d.length ? "ready" : "error"); })
      .catch(() => setDeptState("error"));
  };
  useEffect(() => { loadDepts(); }, []);

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
              {deptState === "loading" && (
                <span className="hint">Loading departments... the server may be waking up, this can take up to a minute.</span>
              )}
              {deptState === "error" && (
                <div className="alert err">
                  Could not load the departments. The server may still be starting, or it has not been updated yet.{" "}
                  <a onClick={loadDepts}>Try again</a>
                </div>
              )}
            </div>
          )}

          {isApp
            ? <NativeGoogleButton onCredential={google} onError={setErr} />
            : <GoogleButton onCredential={google} />}
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
              The Super Admin adds you to your department and gives you a password. You can sign in with that password, or with Google using the same email. Forgot it? Ask the Super Admin to reset it.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
