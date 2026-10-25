import { useEffect } from "react";

export const STATUSES = ["Submitted", "In Progress", "Resolved", "Rejected"];
export const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
export const ROLE_LABEL = { user: "Student / Staff", staff: "Department Staff", admin: "Super Admin" };

export const parse = (d) => (d ? new Date(d.endsWith("Z") ? d : d + "Z") : null);
export const fmt = (d) => {
  const x = parse(d);
  return x ? x.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";
};
export const fmtDate = (d) => {
  const x = parse(d);
  return x ? x.toLocaleDateString([], { dateStyle: "medium" }) : "-";
};

const ICONS = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  close: <path d="M18 6L6 18M6 6l12 12" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: <path d="M20 6L9 17l-5-5" />,
  alert: <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  key: (<><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L21 2M16 7l3 3" /></>),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  star: <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>),
  building: (<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></>),
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  doc: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>),
  inbox: <path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />,
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>),
  eye: (<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>),
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
};

export function Icon({ name, size = 18, fill = "none" }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Avatar({ name = "?", size = 34 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>;
}

export const StatusBadge = ({ s }) => <span className={"badge st-" + s.replace(" ", "")}>{s}</span>;
export const PriorityBadge = ({ p }) => <span className={"pill pri-" + p}>{p}</span>;

export function Stat({ icon, label, value, tone = "blue" }) {
  return (
    <div className="card stat">
      <div className={"ico tone-" + tone}><Icon name={icon} size={20} /></div>
      <div><b>{value}</b><span>{label}</span></div>
    </div>
  );
}

export function Empty({ title, text, children }) {
  return (
    <div className="card empty">
      <div className="empty-ico"><Icon name="inbox" size={26} /></div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

export function Stars({ value = 0, onChange, size = 22 }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} className={n <= value ? "on" : ""}
          onClick={() => onChange && onChange(n)} aria-label={`${n} star`}>
          <Icon name="star" size={size} fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export function Drawer({ title, onClose, children, center = false }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className={"overlay" + (center ? " center" : "")} onClick={onClose}>
      <div className={center ? "modal" : "drawer"} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function BarList({ data, total, tone }) {
  const rows = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className="muted">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div>
      {rows.map(([k, v]) => (
        <div className="barrow" key={k}>
          <span>{k}</span>
          <div className="track"><div className={"fill " + (tone || "")} style={{ width: `${(v / max) * 100}%` }} /></div>
          <em>{v}{total ? "" : ""}</em>
        </div>
      ))}
    </div>
  );
}
