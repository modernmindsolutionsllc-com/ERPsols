from fastapi import FastAPI
from database import init_db
from routers import auth
from auth_utils import require_role, get_current_user
from fastapi import Depends

app = FastAPI(title="Role-Based Auth API", version="1.0.0")


@app.on_event("startup")
def on_startup():
    init_db()


# ── Auth Routes ────────────────────────────────────────────────────────────────
app.include_router(auth.router)


# ── Protected Route Examples ───────────────────────────────────────────────────

@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Any logged-in user can access this."""
    return current_user


@app.get("/admin/dashboard")
def admin_dashboard(current_user: dict = Depends(require_role("admin"))):
    """Only admins."""
    return {"message": "Welcome, Admin!", "user": current_user}


@app.get("/enterprise/dashboard")
def enterprise_dashboard(current_user: dict = Depends(require_role("enterprise", "admin"))):
    """Enterprise users and admins."""
    return {"message": "Welcome, Enterprise!", "user": current_user}


@app.get("/user/dashboard")
def user_dashboard(current_user: dict = Depends(require_role("user", "enterprise", "admin"))):
    """All roles."""
    return {"message": "Welcome, User!", "user": current_user}