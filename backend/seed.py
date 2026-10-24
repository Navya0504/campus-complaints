import sys, requests

BASE = sys.argv[1].rstrip("/")

def call(path, method="GET", body=None, token=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.request(method, BASE + path, json=body, headers=h, timeout=90)
    return r.json()

def get_token(name, email, pw):
    d = call("/auth/register", "POST", {"name": name, "email": email, "password": pw})
    if "token" not in d:
        d = call("/auth/login", "POST", {"email": email, "password": pw})
    return d["token"]

s1 = get_token("Aarav Sharma", "aarav@campus.com", "student123")
s2 = get_token("Diya Rao", "diya@campus.com", "student123")
admin = get_token("Admin", "admin@campus.com", "admin123")

items = [
    (s1, "Wi-Fi not working in library", "No internet since morning, students cannot access portals", "Library, 2nd floor"),
    (s1, "Water leak in boys washroom", "Water leak near the sink, floor is slippery and unsafe", "Block B, Ground floor"),
    (s2, "Garbage not cleared near canteen", "Trash overflowing and bad smell for two days", "Canteen"),
    (s2, "Bus 12 arriving late every day", "The college bus has been 30 minutes late all week", "Main gate"),
    (s1, "Fan not working in classroom", "Ceiling fan broken in room 304", "Block A, Room 304"),
    (s2, "Projector not working", "Projector is broken in seminar hall", "Seminar Hall"),
]
ids = []
for tok, title, desc, loc in items:
    c = call("/complaints", "POST", {"title": title, "description": desc, "location": loc}, tok)
    ids.append(c["id"])
    print(c["ticket_id"], c["category"], c["department"], c["priority"])

call(f"/complaints/{ids[0]}/status", "PATCH", {"status": "Resolved", "note": "Router replaced"}, admin)
call(f"/complaints/{ids[1]}/status", "PATCH", {"status": "In Progress", "note": "Plumber assigned"}, admin)
call(f"/complaints/{ids[2]}/status", "PATCH", {"status": "Resolved", "note": "Area cleaned"}, admin)
call(f"/complaints/{ids[3]}/status", "PATCH", {"status": "In Progress", "note": "Forwarded to driver"}, admin)
call(f"/complaints/{ids[5]}/status", "PATCH", {"status": "Rejected", "note": "Duplicate of earlier request"}, admin)
call(f"/complaints/{ids[0]}/feedback", "POST", {"rating": 5, "comment": "Fixed quickly"}, s1)
call(f"/complaints/{ids[2]}/feedback", "POST", {"rating": 4, "comment": "Good work"}, s2)
print("Done")