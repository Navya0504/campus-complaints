import os, re
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt, jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field
from sqlalchemy import (create_engine, text, inspect, String, Text, DateTime,
                        ForeignKey, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./local.db"
SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# Roles: "user"  = student / staff member who reports issues
#        "staff" = department member (added by the Super Admin). Works only on complaints of
#                  their own department that they have taken; can VIEW everything else.
#        "admin" = Super Admin (sees and manages everything, adds / removes staff)
IST = timedelta(hours=5, minutes=30)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------- models ----------
class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200), default="")  # "" = no password yet
    role: Mapped[str] = mapped_column(String(10), default="user")
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    google_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(80), default="")  # job title shown to the department
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)

class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30))
    location: Mapped[str] = mapped_column(String(150), default="")
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    assigned_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="Submitted")
    priority: Mapped[str] = mapped_column(String(10), default="Medium")
    due_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

class StatusHistory(Base):
    __tablename__ = "status_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id"))
    status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(String(300), default="")
    changed_by: Mapped[str] = mapped_column(String(100))
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id"), unique=True)
    rating: Mapped[int]
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# ---------- rules ----------
CATEGORIES = {  # category: (department, SLA hours)
    "Infrastructure": ("Maintenance", 72),
    "Wi-Fi": ("IT Services", 24),
    "Cleanliness": ("Housekeeping", 48),
    "Transport": ("Transport Office", 48),
    "Other": ("Administration", 72),
}
OPEN = ("Submitted", "In Progress")
STATUSES = OPEN + ("Resolved", "Rejected")
KEYWORDS = {
    "Wi-Fi": ["wifi", "wi-fi", "internet", "network", "router", "lan"],
    "Transport": ["bus", "transport", "driver", "route", "van"],
    "Cleanliness": ["dirty", "garbage", "trash", "toilet", "washroom", "clean", "smell", "waste"],
    "Infrastructure": ["fan", "light", "bench", "door", "window", "leak", "water", "roof",
                       "lift", "electric", "power", "broken", "projector", "ac"],
}
URGENT = ["fire", "short circuit", "electric shock", "sparking", "gas", "flood", "leak",
          "ragging", "harassment", "injury", "accident"]
HIGH = ["urgent", "not working", "broken", "no water", "power cut", "unsafe", "danger"]


def has(t, words):
    return any(re.search(r"\b" + re.escape(w) + r"\b", t) for w in words)

def guess_category(t):
    for cat, words in KEYWORDS.items():
        if has(t, words):
            return cat
    return "Other"

def guess_priority(t):
    if has(t, URGENT):
        return "Urgent"
    if has(t, HIGH):
        return "High"
    return "Medium"


# ---------- auth ----------
bearer = HTTPBearer()

def hash_pw(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def check_pw(p, h):
    if not h:
        return False
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False

def make_token(u):
    exp = datetime.now(timezone.utc) + timedelta(days=2)
    return jwt.encode({"sub": str(u.id), "role": u.role, "exp": exp}, SECRET, algorithm="HS256")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def current_user(creds=Depends(bearer), db=Depends(get_db)):
    try:
        data = jwt.decode(creds.credentials, SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    u = db.get(User, int(data["sub"]))
    if not u:
        raise HTTPException(401, "User not found")
    return u

def staff_only(u=Depends(current_user)):
    """Department admins and the super admin."""
    if u.role not in ("staff", "admin"):
        raise HTTPException(403, "Staff only")
    return u

def admin_only(u=Depends(current_user)):
    """Super admin only."""
    if u.role != "admin":
        raise HTTPException(403, "Super admin only")
    return u

def user_out(u, db):
    dep = db.get(Department, u.department_id) if u.department_id else None
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "title": u.title or "",
            "department_id": u.department_id, "department": dep.name if dep else None,
            "has_password": bool(u.password_hash)}

def can_view(user, c):
    if user.role in ("admin", "staff"):
        return True  # staff may look at every department, but only work on their own
    return c.user_id == user.id

def perm(user, c):
    """What this user may do with this complaint."""
    mine_dept = user.role == "staff" and c.department_id == user.department_id
    is_open = c.status in OPEN
    can_claim = mine_dept and is_open and c.assigned_to_id is None
    can_update = user.role == "admin" or (mine_dept and c.assigned_to_id == user.id)
    return {
        "can_claim": can_claim,
        "can_update": can_update,
        "can_release": can_update and is_open and c.assigned_to_id is not None,
        "can_assign": user.role == "admin" and is_open,
    }

def scoped(db, user):
    q = db.query(Complaint)
    if user.role == "staff":
        q = q.filter(Complaint.department_id == user.department_id)
    elif user.role == "user":
        q = q.filter(Complaint.user_id == user.id)
    return q

def release_open_work(db, uid, who="System"):
    """Put a person's open complaints back in their department queue."""
    rows = db.query(Complaint).filter(Complaint.assigned_to_id == uid,
                                      Complaint.status.in_(OPEN)).all()
    for c in rows:
        c.assigned_to_id = None
        c.status = "Submitted"
        db.add(StatusHistory(complaint_id=c.id, status="Submitted",
                             note="Returned to the department queue", changed_by=who))


# ---------- tables + light migration + seed ----------
Base.metadata.create_all(engine)

def add_column(table, col, ddl):
    cols = {c["name"] for c in inspect(engine).get_columns(table)}
    if col not in cols:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

def migrate():
    """Adds newer columns to existing tables (safe to run on every start)."""
    add_column("users", "department_id", "INTEGER")
    add_column("users", "google_id", "VARCHAR(100)")
    add_column("users", "title", "VARCHAR(80) DEFAULT ''")
    add_column("complaints", "assigned_to_id", "INTEGER")

migrate()

def seed():
    with SessionLocal() as db:
        for dept, _ in CATEGORIES.values():
            if not db.query(Department).filter_by(name=dept).first():
                db.add(Department(name=dept))
        if not db.query(User).filter_by(role="admin").first():
            db.add(User(name="Super Admin", email="admin@campus.com",
                        password_hash=hash_pw("admin123"), role="admin"))
        db.commit()

seed()


# ---------- schemas ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1)
    email: str
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: str
    password: str

class GoogleIn(BaseModel):
    credential: str
    staff_login: bool = False  # staff sign-in never creates a new account

class ProfileIn(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None

class AssignIn(BaseModel):
    user_id: Optional[int] = None

class PasswordIn(BaseModel):
    password: str = Field(min_length=6)
    current_password: Optional[str] = None

class ComplaintIn(BaseModel):
    title: str
    description: str
    category: Optional[str] = None
    location: str = ""
    image_url: Optional[str] = None

class StatusIn(BaseModel):
    status: str
    note: str = ""
    department_id: Optional[int] = None

class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""

class SuggestIn(BaseModel):
    text: str

class StaffIn(BaseModel):
    name: str = Field(min_length=1)
    email: str
    password: str = Field(min_length=6)
    department_id: int
    title: str = ""

class StaffPatch(BaseModel):
    department_id: Optional[int] = None
    password: Optional[str] = Field(default=None, min_length=6)
    title: Optional[str] = None


def out(c, db, detail=False, user=None):
    dept = db.get(Department, c.department_id)
    owner = db.get(User, c.user_id)
    worker = db.get(User, c.assigned_to_id) if c.assigned_to_id else None
    d = {
        "id": c.id, "ticket_id": c.ticket_id, "title": c.title,
        "description": c.description, "category": c.category, "location": c.location,
        "image_url": c.image_url, "department_id": c.department_id,
        "department": dept.name if dept else None,
        "status": c.status, "priority": c.priority,
        "created_at": c.created_at.isoformat(), "due_at": c.due_at.isoformat(),
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "submitted_by": owner.name if owner else None,
        "assigned_to_id": c.assigned_to_id,
        "assigned_to": worker.name if worker else None,
        "is_overdue": c.status in OPEN and c.due_at < now(),
    }
    if user is not None:
        d.update(perm(user, c))
    if detail:
        hist = db.query(StatusHistory).filter_by(complaint_id=c.id).order_by(StatusHistory.id).all()
        d["history"] = [{"status": h.status, "note": h.note, "changed_by": h.changed_by,
                         "changed_at": h.changed_at.isoformat()} for h in hist]
        fb = db.query(Feedback).filter_by(complaint_id=c.id).first()
        d["feedback"] = {"rating": fb.rating, "comment": fb.comment} if fb else None
    return d


def staff_out(u, db):
    dep = db.get(Department, u.department_id) if u.department_id else None
    open_n = db.query(func.count(Complaint.id)).filter(
        Complaint.assigned_to_id == u.id, Complaint.status.in_(OPEN)).scalar()
    done_n = db.query(func.count(Complaint.id)).filter(
        Complaint.assigned_to_id == u.id, Complaint.status == "Resolved").scalar()
    return {"id": u.id, "name": u.name, "email": u.email, "title": u.title or "",
            "department_id": u.department_id, "department": dep.name if dep else None,
            "open_count": open_n, "resolved_count": done_n,
            "created_at": u.created_at.isoformat()}


# ---------- app ----------
app = FastAPI(title="Campus Complaints API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status": "ok", "app": "Campus Complaints"}

@app.get("/db-check")
def db_check():
    with engine.connect() as conn:
        return {"db": conn.execute(text("select 1")).scalar()}

@app.get("/config")
def config():
    return {"google_client_id": GOOGLE_CLIENT_ID}


# ----- auth -----
@app.post("/auth/register")
def register(body: RegisterIn, db=Depends(get_db)):
    email = body.email.strip().lower()
    existing = db.query(User).filter_by(email=email).first()
    if existing:
        if not existing.password_hash:
            raise HTTPException(400, "This email already signed in with Google. Use 'Continue with Google', "
                                     "then set a password from your account menu.")
        raise HTTPException(400, "Email already registered")
    u = User(name=body.name.strip(), email=email, password_hash=hash_pw(body.password), role="user")
    db.add(u)
    db.commit()
    return {"token": make_token(u), "user": user_out(u, db)}

@app.post("/auth/login")
def login(body: LoginIn, db=Depends(get_db)):
    u = db.query(User).filter_by(email=body.email.strip().lower()).first()
    if u and not u.password_hash:
        raise HTTPException(400, "This account uses Google sign-in and has no password yet. "
                                 "Use 'Continue with Google'.")
    if not u or not check_pw(body.password, u.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(u), "user": user_out(u, db)}

@app.post("/auth/google")
def google_login(body: GoogleIn, db=Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not configured on the server")
    try:
        info = google_id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(401, "Google sign-in failed. Please try again.")
    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(401, "Your Google email is not verified")
    email = info["email"].strip().lower()
    u = db.query(User).filter_by(email=email).first()
    created = False
    if body.staff_login and (not u or u.role not in ("staff", "admin")):
        raise HTTPException(403, "This Google account has not been added as department staff. "
                                 "Ask the Super Admin to add your email to your department.")
    if not u:
        u = User(name=(info.get("name") or email.split("@")[0]).strip(), email=email,
                 password_hash="", role="user", google_id=info.get("sub"))
        db.add(u)
        created = True
    elif not u.google_id:
        u.google_id = info.get("sub")
    db.commit()
    return {"token": make_token(u), "user": user_out(u, db), "is_new": created}

@app.get("/auth/me")
def me(user=Depends(current_user), db=Depends(get_db)):
    return user_out(user, db)

@app.post("/auth/set-password")
def set_password(body: PasswordIn, user=Depends(current_user), db=Depends(get_db)):
    if user.password_hash and not check_pw(body.current_password or "", user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_pw(body.password)
    db.commit()
    return user_out(user, db)


@app.patch("/auth/profile")
def update_profile(body: ProfileIn, user=Depends(current_user), db=Depends(get_db)):
    """A person can edit only their own details."""
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        user.name = name[:100]
    if body.title is not None:
        if user.role != "staff":
            raise HTTPException(400, "Only department staff have a job title")
        user.title = body.title.strip()[:80]
    db.commit()
    return user_out(user, db)


# ----- reference data -----
@app.get("/public/departments")
def public_departments(db=Depends(get_db)):
    return [{"id": d.id, "name": d.name} for d in db.query(Department).order_by(Department.name).all()]

@app.get("/categories")
def categories():
    return [{"name": k, "department": v[0], "sla_hours": v[1]} for k, v in CATEGORIES.items()]

@app.get("/departments")
def departments(db=Depends(get_db), user=Depends(staff_only)):
    return [{"id": d.id, "name": d.name} for d in db.query(Department).order_by(Department.name).all()]

@app.post("/suggest")
def suggest(body: SuggestIn):
    t = body.text.lower()
    cat = guess_category(t)
    return {"category": cat, "priority": guess_priority(t), "department": CATEGORIES[cat][0]}


# ----- complaints -----
@app.post("/complaints")
def create_complaint(body: ComplaintIn, user=Depends(current_user), db=Depends(get_db)):
    t = (body.title + " " + body.description).lower()
    category = body.category if body.category in CATEGORIES else guess_category(t)
    priority = guess_priority(t)
    dept_name, hours = CATEGORIES[category]
    if priority == "Urgent":
        hours = hours // 2
    dept = db.query(Department).filter_by(name=dept_name).first()
    c = Complaint(user_id=user.id, title=body.title, description=body.description,
                  category=category, location=body.location, image_url=body.image_url,
                  department_id=dept.id, priority=priority,
                  due_at=now() + timedelta(hours=hours))
    db.add(c)
    db.flush()
    c.ticket_id = f"CMP-{now().year}-{c.id:04d}"
    db.add(StatusHistory(complaint_id=c.id, status="Submitted",
                         note="Complaint submitted", changed_by=user.name))
    db.commit()
    return out(c, db, True, user)

@app.get("/complaints")
def list_complaints(status: Optional[str] = None, category: Optional[str] = None,
                    scope: str = "dept", user=Depends(current_user), db=Depends(get_db)):
    # staff see their own department by default; scope=all shows every department (view only)
    q = db.query(Complaint) if (user.role == "staff" and scope == "all") else scoped(db, user)
    if status:
        q = q.filter(Complaint.status == status)
    if category:
        q = q.filter(Complaint.category == category)
    return [out(c, db, user=user) for c in q.order_by(Complaint.id.desc()).all()]

@app.get("/complaints/{cid}")
def get_complaint(cid: int, user=Depends(current_user), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or not can_view(user, c):
        raise HTTPException(404, "Complaint not found")
    return out(c, db, True, user)

@app.patch("/complaints/{cid}/status")
def update_status(cid: int, body: StatusIn, user=Depends(staff_only), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or not can_view(user, c):
        raise HTTPException(404, "Complaint not found")
    if not perm(user, c)["can_update"]:
        if c.department_id != user.department_id:
            dept = db.get(Department, c.department_id)
            raise HTTPException(403, f"This complaint belongs to {dept.name}. You can view it but not change it.")
        if c.assigned_to_id is None:
            raise HTTPException(403, "Take this complaint first, then you can update it.")
        worker = db.get(User, c.assigned_to_id)
        raise HTTPException(403, f"{worker.name if worker else 'Another member'} is handling this complaint.")
    if body.status not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    note = body.note
    status = body.status
    if body.department_id and body.department_id != c.department_id:
        d = db.get(Department, body.department_id)
        if not d:
            raise HTTPException(400, "Unknown department")
        c.department_id = d.id
        c.assigned_to_id = None  # the new department picks it up from its own queue
        if status in OPEN:
            status = "Submitted"
        note = (note + " | " if note else "") + f"Forwarded to {d.name}"
    c.status = status
    c.resolved_at = now() if status in ("Resolved", "Rejected") else None
    db.add(StatusHistory(complaint_id=c.id, status=status, note=note, changed_by=user.name))
    db.commit()
    return out(c, db, True, user)

@app.post("/complaints/{cid}/claim")
def claim_complaint(cid: int, user=Depends(staff_only), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or not can_view(user, c):
        raise HTTPException(404, "Complaint not found")
    if user.role != "staff":
        raise HTTPException(403, "Only department staff can take complaints. Use Assign instead.")
    if c.department_id != user.department_id:
        dept = db.get(Department, c.department_id)
        raise HTTPException(403, f"This complaint belongs to {dept.name}, not your department.")
    if c.status not in OPEN:
        raise HTTPException(400, "This complaint is already closed.")
    if c.assigned_to_id and c.assigned_to_id != user.id:
        worker = db.get(User, c.assigned_to_id)
        raise HTTPException(400, f"Already taken by {worker.name if worker else 'another member'}.")
    if c.assigned_to_id != user.id:
        c.assigned_to_id = user.id
        c.status = "In Progress"
        db.add(StatusHistory(complaint_id=c.id, status="In Progress",
                             note=f"Taken by {user.name}", changed_by=user.name))
        db.commit()
    return out(c, db, True, user)

@app.post("/complaints/{cid}/release")
def release_complaint(cid: int, user=Depends(staff_only), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or not can_view(user, c):
        raise HTTPException(404, "Complaint not found")
    if not perm(user, c)["can_release"]:
        raise HTTPException(403, "You can release only a complaint you are handling.")
    c.assigned_to_id = None
    c.status = "Submitted"
    db.add(StatusHistory(complaint_id=c.id, status="Submitted",
                         note=f"Released to the department queue by {user.name}", changed_by=user.name))
    db.commit()
    return out(c, db, True, user)

@app.patch("/complaints/{cid}/assign")
def assign_complaint(cid: int, body: AssignIn, admin=Depends(admin_only), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c:
        raise HTTPException(404, "Complaint not found")
    if c.status not in OPEN:
        raise HTTPException(400, "This complaint is already closed.")
    if body.user_id is None:
        if c.assigned_to_id is not None:
            c.assigned_to_id = None
            c.status = "Submitted"
            db.add(StatusHistory(complaint_id=c.id, status="Submitted",
                                 note=f"Returned to the department queue by {admin.name}", changed_by=admin.name))
    else:
        u = db.get(User, body.user_id)
        if not u or u.role != "staff" or u.department_id != c.department_id:
            dept = db.get(Department, c.department_id)
            raise HTTPException(400, f"Pick a member of {dept.name}.")
        c.assigned_to_id = u.id
        if c.status == "Submitted":
            c.status = "In Progress"
        db.add(StatusHistory(complaint_id=c.id, status=c.status,
                             note=f"Assigned to {u.name} by {admin.name}", changed_by=admin.name))
    db.commit()
    return out(c, db, True, admin)

@app.post("/complaints/{cid}/feedback")
def add_feedback(cid: int, body: FeedbackIn, user=Depends(current_user), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Complaint not found")
    if c.status != "Resolved":
        raise HTTPException(400, "Feedback is allowed only after the complaint is Resolved")
    if db.query(Feedback).filter_by(complaint_id=cid).first():
        raise HTTPException(400, "Feedback already submitted")
    db.add(Feedback(complaint_id=cid, rating=body.rating, comment=body.comment))
    db.commit()
    return out(c, db, True, user)


# ----- analytics (department admins see only their department) -----
@app.get("/stats")
def stats(user=Depends(staff_only), db=Depends(get_db)):
    items = scoped(db, user).all()
    by_status, by_category, by_priority, by_dept = {}, {}, {}, {}
    dept_names = {d.id: d.name for d in db.query(Department).all()}
    for c in items:
        by_status[c.status] = by_status.get(c.status, 0) + 1
        by_category[c.category] = by_category.get(c.category, 0) + 1
        by_priority[c.priority] = by_priority.get(c.priority, 0) + 1
        n = dept_names.get(c.department_id, "?")
        by_dept[n] = by_dept.get(n, 0) + 1
    overdue = sum(1 for c in items if c.status in OPEN and c.due_at < now())
    unassigned = sum(1 for c in items if c.status in OPEN and c.assigned_to_id is None)
    mine_open = sum(1 for c in items if c.assigned_to_id == user.id and c.status in OPEN)
    mine_resolved = sum(1 for c in items if c.assigned_to_id == user.id and c.status == "Resolved")
    hrs = [(c.resolved_at - c.created_at).total_seconds() / 3600
           for c in items if c.status == "Resolved" and c.resolved_at]
    ids = [c.id for c in items]
    ratings = [f.rating for f in db.query(Feedback).filter(Feedback.complaint_id.in_(ids)).all()] if ids else []
    today = (now() + IST).date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    counts = {d: 0 for d in days}
    for c in items:
        d = (c.created_at + IST).date()
        if d in counts:
            counts[d] += 1
    return {
        "scope": "all" if user.role == "admin" else dept_names.get(user.department_id, "Department"),
        "total": len(items), "by_status": by_status, "by_category": by_category,
        "by_priority": by_priority,
        "by_department": by_dept if user.role == "admin" else {},
        "overdue": overdue, "unassigned": unassigned,
        "mine_open": mine_open, "mine_resolved": mine_resolved,
        "avg_resolution_hours": round(sum(hrs) / len(hrs), 2) if hrs else None,
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "rating_count": len(ratings),
        "last7": [{"date": d.isoformat(), "label": d.strftime("%a"), "count": counts[d]} for d in days],
    }


# ----- department team -----
@app.get("/team")
def team(user=Depends(staff_only), db=Depends(get_db)):
    """Staff see who is in their own department and what they are working on."""
    q = db.query(User).filter(User.role == "staff")
    if user.role == "staff":
        q = q.filter(User.department_id == user.department_id)
    rows = []
    for u in q.order_by(User.department_id, User.name).all():
        d = staff_out(u, db)
        work = (db.query(Complaint)
                .filter(Complaint.assigned_to_id == u.id, Complaint.status.in_(OPEN))
                .order_by(Complaint.due_at).limit(3).all())
        d["working_on"] = [{"id": c.id, "ticket_id": c.ticket_id, "title": c.title,
                            "status": c.status} for c in work]
        d["is_me"] = u.id == user.id
        rows.append(d)
    return rows


# ----- staff management (Super Admin only) -----
@app.get("/staff")
def list_staff(admin=Depends(admin_only), db=Depends(get_db)):
    rows = db.query(User).filter_by(role="staff").order_by(User.name).all()
    return [staff_out(u, db) for u in rows]

@app.post("/staff")
def create_staff(body: StaffIn, admin=Depends(admin_only), db=Depends(get_db)):
    if not db.get(Department, body.department_id):
        raise HTTPException(400, "Unknown department")
    email = body.email.strip().lower()
    u = db.query(User).filter_by(email=email).first()
    if u:
        if u.role == "admin":
            raise HTTPException(400, "That email belongs to the super admin")
        if u.role == "staff" and u.department_id != body.department_id:
            release_open_work(db, u.id, admin.name)
        u.role = "staff"
        u.department_id = body.department_id
        u.password_hash = hash_pw(body.password)
        if body.title.strip():
            u.title = body.title.strip()[:80]
    else:
        u = User(name=body.name.strip(), email=email, password_hash=hash_pw(body.password),
                 role="staff", department_id=body.department_id, title=body.title.strip()[:80])
        db.add(u)
    db.commit()
    return staff_out(u, db)

@app.patch("/staff/{uid}")
def update_staff(uid: int, body: StaffPatch, admin=Depends(admin_only), db=Depends(get_db)):
    u = db.get(User, uid)
    if not u or u.role != "staff":
        raise HTTPException(404, "Staff member not found")
    if body.department_id is not None and body.department_id != u.department_id:
        if not db.get(Department, body.department_id):
            raise HTTPException(400, "Unknown department")
        release_open_work(db, u.id, admin.name)
        u.department_id = body.department_id
    if body.password:
        u.password_hash = hash_pw(body.password)
    if body.title is not None:
        u.title = body.title.strip()[:80]
    db.commit()
    return staff_out(u, db)

@app.delete("/staff/{uid}")
def remove_staff(uid: int, admin=Depends(admin_only), db=Depends(get_db)):
    u = db.get(User, uid)
    if not u or u.role != "staff":
        raise HTTPException(404, "Staff member not found")
    release_open_work(db, u.id, admin.name)
    u.role = "user"  # keeps their account and complaints, removes department access
    u.department_id = None
    u.title = ""
    db.commit()
    return {"ok": True}
