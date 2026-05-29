"""
main.py
───────
Application entry point.
Initialises the database on startup and wires all micro-service routers.
"""

import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import init_db, get_db, User, UserToolAccess
from Auth import router as auth_router
from dependencies import get_verified_user
from routers import config_snapshot
from routers import data_conversion
from routers import payroll
from routers import bip_integration
from routers import admin
from routers import tracking
from routers import integrations
from routers import bip_reports
from routers import templates
app = FastAPI(
    title="ERPsols API",
    version="1.0.0",
    description="Enterprise Resource Planning – Micro-service Backend",
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
configured_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",")
    if origin.strip()
]

# Keep the explicit production URLs, local dev URLs, and a configurable list.
allowed_origins = list(dict.fromkeys([
    frontend_url,
    *configured_origins,
    "https://er-psols.vercel.app",
    "https://erpsols.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ── Lifecycle ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    init_db()
    # Fail-fast: validate Fernet key is present and usable
    from routers.integrations import _get_fernet
    try:
        _get_fernet()
    except (RuntimeError, ValueError) as e:
        import sys
        print(f"\n🔴 FATAL: {e}\n", file=sys.stderr)
        sys.exit(1)


# ── Routers ────────────────────────────────────────────────────────────────────

# Auth (signup / login)
app.include_router(auth_router)

# Config Snapshot micro-service (enterprise + admin only)
app.include_router(config_snapshot.router)

# Data Conversion micro-service (enterprise + admin only)
app.include_router(data_conversion.router)

# Payroll Reconciliation micro-service (enterprise + admin only)
app.include_router(payroll.router)

# BIP Reporting micro-service (enterprise + admin only)
app.include_router(bip_integration.router)

# Admin Control Panel (admin only)
app.include_router(admin.router)

# Session Tracking (any authenticated user)
app.include_router(tracking.router)

# Oracle Integration (enterprise + admin)
app.include_router(integrations.router)

# BIP Reports Configuration
app.include_router(bip_reports.router)

# Data Templates micro-service (enterprise + admin only)
app.include_router(templates.router)


# ── Health Check ───────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}


# ── Authenticated Identity ─────────────────────────────────────────────────────

@app.get("/me", tags=["Identity"])
def get_me(
    current_user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Returns the live authenticated user profile and current tool grants."""
    user_id = int(current_user["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return current_user

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": current_user.get("role", "user"),
        "tool_access": sorted(
            grant.tool_key
            for grant in db.query(UserToolAccess).filter(UserToolAccess.user_id == user.id).all()
        ),
    }
