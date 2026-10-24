import os, re
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt, jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./local.db"
SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


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
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(10), default="user")
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
    return bcrypt.checkpw(p.encode(), h.encode())

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

def admin_only(u=Depends(current_user)):
    if u.role != "admin":
        raise HTTPException(403, "Admin only")
    return u

def user_out(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


# ---------- tables + seed ----------
Base.metadata.create_all(engine)

def seed():
    with SessionLocal() as db:
        for dept, _ in CATEGORIES.values():
            if not db.query(Department).filter_by(name=dept).first():
                db.add(Department(name=dept))
        if not db.query(User).filter_by(role="admin").first():
            db.add(User(name="Admin", email="admin@campus.com",
                        password_hash=hash_pw("admin123"), role="admin"))
        db.commit()

seed()


# ---------- schemas ----------
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

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


def out(c, db, detail=False):
    dept = db.get(Department, c.department_id)
    user = db.get(User, c.user_id)
    d = {
        "id": c.id, "ticket_id": c.ticket_id, "title": c.title,
        "description": c.description, "category": c.category, "location": c.location,
        "image_url": c.image_url, "department_id": c.department_id,
        "department": dept.name if dept else None,
        "status": c.status, "priority": c.priority,
        "created_at": c.created_at.isoformat(), "due_at": c.due_at.isoformat(),
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "submitted_by": user.name if user else None,
        "is_overdue": c.status in OPEN and c.due_at < now(),
    }
    if detail:
        hist = db.query(StatusHistory).filter_by(complaint_id=c.id).order_by(StatusHistory.id).all()
        d["history"] = [{"status": h.status, "note": h.note, "changed_by": h.changed_by,
                         "changed_at": h.changed_at.isoformat()} for h in hist]
        fb = db.query(Feedback).filter_by(complaint_id=c.id).first()
        d["feedback"] = {"rating": fb.rating, "comment": fb.comment} if fb else None
    return d


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


@app.post("/auth/register")
def register(body: RegisterIn, db=Depends(get_db)):
    email = body.email.strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(400, "Email already registered")
    u = User(name=body.name.strip(), email=email, password_hash=hash_pw(body.password), role="user")
    db.add(u)
    db.commit()
    return {"token": make_token(u), "user": user_out(u)}

@app.post("/auth/login")
def login(body: LoginIn, db=Depends(get_db)):
    u = db.query(User).filter_by(email=body.email.strip().lower()).first()
    if not u or not check_pw(body.password, u.password_hash):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(u), "user": user_out(u)}

@app.get("/auth/me")
def me(user=Depends(current_user)):
    return user_out(user)


@app.get("/categories")
def categories():
    return [{"name": k, "department": v[0], "sla_hours": v[1]} for k, v in CATEGORIES.items()]

@app.get("/departments")
def departments(db=Depends(get_db), user=Depends(admin_only)):
    return [{"id": d.id, "name": d.name} for d in db.query(Department).all()]

@app.post("/suggest")
def suggest(body: SuggestIn):
    t = body.text.lower()
    return {"category": guess_category(t), "priority": guess_priority(t)}


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
    return out(c, db, True)

@app.get("/complaints")
def list_complaints(status: Optional[str] = None, category: Optional[str] = None,
                    user=Depends(current_user), db=Depends(get_db)):
    q = db.query(Complaint)
    if user.role != "admin":
        q = q.filter(Complaint.user_id == user.id)
    if status:
        q = q.filter(Complaint.status == status)
    if category:
        q = q.filter(Complaint.category == category)
    return [out(c, db) for c in q.order_by(Complaint.id.desc()).all()]

@app.get("/complaints/{cid}")
def get_complaint(cid: int, user=Depends(current_user), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c or (user.role != "admin" and c.user_id != user.id):
        raise HTTPException(404, "Complaint not found")
    return out(c, db, True)

@app.patch("/complaints/{cid}/status")
def update_status(cid: int, body: StatusIn, admin=Depends(admin_only), db=Depends(get_db)):
    c = db.get(Complaint, cid)
    if not c:
        raise HTTPException(404, "Complaint not found")
    if body.status not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    note = body.note
    if body.department_id and body.department_id != c.department_id:
        d = db.get(Department, body.department_id)
        if not d:
            raise HTTPException(400, "Unknown department")
        c.department_id = d.id
        note = (note + " | " if note else "") + f"Assigned to {d.name}"
    c.status = body.status
    c.resolved_at = now() if body.status in ("Resolved", "Rejected") else None
    db.add(StatusHistory(complaint_id=c.id, status=body.status, note=note, changed_by=admin.name))
    db.commit()
    return out(c, db, True)

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
    return out(c, db, True)

@app.get("/stats")
def stats(admin=Depends(admin_only), db=Depends(get_db)):
    total = db.query(func.count(Complaint.id)).scalar()
    by_status = {r[0]: r[1] for r in db.query(Complaint.status, func.count(Complaint.id)).group_by(Complaint.status).all()}
    by_category = {r[0]: r[1] for r in db.query(Complaint.category, func.count(Complaint.id)).group_by(Complaint.category).all()}
    overdue = db.query(func.count(Complaint.id)).filter(Complaint.status.in_(OPEN), Complaint.due_at < now()).scalar()
    resolved = db.query(Complaint).filter(Complaint.status == "Resolved", Complaint.resolved_at.isnot(None)).all()
    hrs = [(c.resolved_at - c.created_at).total_seconds() / 3600 for c in resolved]
    avg_rating = db.query(func.avg(Feedback.rating)).scalar()
    return {
        "total": total, "by_status": by_status, "by_category": by_category,
        "overdue": overdue,
        "avg_resolution_hours": round(sum(hrs) / len(hrs), 2) if hrs else None,
        "avg_rating": round(float(avg_rating), 2) if avg_rating else None,
    }