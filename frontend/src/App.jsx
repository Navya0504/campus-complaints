import { useEffect, useState } from "react";
import { api } from "./api";
import { Icon, Avatar, ROLE_LABEL } from "./ui";
import AuthScreen from "./Auth";
import AccountModal from "./Account";
import ComplaintDrawer from "./Detail";
import {
  UserOverview, NewComplaint, ComplaintsPage, StaffOverview, ManageStaff, TeamPage,
} from "./Pages";

const NAV = {
  user: [["overview", "Overview", "dashboard"], ["new", "New complaint", "plus"], ["mine", "My complaints", "list"]],
  staff: [["overview", "Overview", "dashboard"], ["complaints", "Complaints", "list"], ["team", "My team", "users"]],
  admin: [["overview", "Overview", "dashboard"], ["complaints", "All complaints", "list"], ["team", "Teams", "users"], ["staff", "Manage staff", "building"]],
};

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem("auth")); } catch { return null; }
  });
  const [page, setPage] = useState("overview");
  const [openId, setOpenId] = useState(null);
  const [account, setAccount] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const persist = (d) => { localStorage.setItem("auth", JSON.stringify(d)); setAuth(d); };
  const login = (d) => { persist(d); setPage("overview"); };
  const logout = () => { localStorage.removeItem("auth"); setAuth(null); setOpenId(null); setAccount(false); };
  const updateUser = (user) => persist({ ...auth, user });

  // keep the profile (role, department, title) fresh, and load departments for staff
  useEffect(() => {
    if (!auth) return;
    api("/auth/me", "GET", null, auth.token).then((u) => {
      if (JSON.stringify(u) !== JSON.stringify(auth.user)) persist({ ...auth, user: u });
    }).catch(() => {});
    if (auth.user.role !== "user") {
      api("/departments", "GET", null, auth.token).then(setDepartments).catch(() => {});
    }
  }, [auth?.token]);

  if (!auth) return <AuthScreen onAuth={login} />;

  const { user, token } = auth;
  const nav = NAV[user.role] || NAV.user;
  const current = nav.find((n) => n[0] === page) ? page : "overview";
  const titleOf = nav.find((n) => n[0] === current)[1];

  let view;
  if (user.role === "user") {
    view = current === "overview" ? <UserOverview auth={auth} tick={tick} go={setPage} onOpen={setOpenId} openAccount={() => setAccount(true)} />
      : current === "new" ? <NewComplaint token={token} onCreated={refresh} go={setPage} onOpen={setOpenId} />
      : <ComplaintsPage token={token} user={user} departments={[]} onOpen={setOpenId} tick={tick}
          title="My complaints" subtitle="Everything you have reported, and where it stands." />;
  } else {
    view = current === "overview" ? <StaffOverview auth={auth} tick={tick} go={setPage} onOpen={setOpenId} />
      : current === "complaints" ? <ComplaintsPage token={token} user={user} departments={departments} onOpen={setOpenId} tick={tick}
          title={user.role === "admin" ? "All complaints" : `${user.department} complaints`}
          subtitle={user.role === "admin"
            ? "Every complaint across all departments."
            : "Take a complaint from the queue to work on it. Other departments are view-only."} />
      : current === "team" ? <TeamPage auth={auth} tick={tick} onOpen={setOpenId} onEditProfile={() => setAccount(true)} />
      : <ManageStaff token={token} departments={departments} tick={tick} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Icon name="shield" size={20} /></div>
          <span>Campus Resolve</span>
        </div>
        <nav className="nav">
          {nav.map(([key, label, icon]) => (
            <button key={key} className={current === key ? "active" : ""} onClick={() => setPage(key)}>
              <Icon name={icon} size={20} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="role-chip">
            <small>Signed in as</small>
            <b>{ROLE_LABEL[user.role]}</b>
            {user.department && <span>{user.department}</span>}
            {user.title && <span>{user.title}</span>}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="top-brand"><div className="brand-logo"><Icon name="shield" size={18} /></div><b>Campus Resolve</b></div>
          <h2 className="top-title">{titleOf}</h2>
          <div className="top-right">
            <button className="who" onClick={() => setAccount(true)} title="My account">
              <Avatar name={user.name} />
              <div className="who-text"><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></div>
            </button>
            <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="content">{view}</main>
      </div>

      {openId && (
        <ComplaintDrawer id={openId} token={token} user={user} departments={departments}
          onClose={() => setOpenId(null)} onChanged={refresh} />
      )}
      {account && <AccountModal auth={auth} onClose={() => setAccount(false)} onUpdated={updateUser} />}
    </div>
  );
}
