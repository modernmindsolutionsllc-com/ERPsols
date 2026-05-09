"""
main.py
───────
Application entry point.
Initialises the database on startup and wires all micro-service routers.
"""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from Auth import router as auth_router
from Auth_utils import get_current_user
from routers import config_snapshot
from routers import data_conversion
from routers import payroll
from routers import bip_integration
from routers import admin
from routers import tracking
from routers import integrations
from routers import bip_reports
app = FastAPI(
    title="ERPsols API",
    version="1.0.0",
    description="Enterprise Resource Planning – Micro-service Backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Lifecycle ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    init_db()


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


# ── Health Check ───────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}


# ── Authenticated Identity ─────────────────────────────────────────────────────

@app.get("/me", tags=["Identity"])
def get_me(current_user: dict = Depends(get_current_user)):
    """Returns the decoded JWT payload for the currently authenticated user."""
    return current_user
