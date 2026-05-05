"""
Auth.py
───────
Authentication router — Passwordless OTP flow.

Step 1:  POST /auth/request-otp   → generates & emails a 6-digit code
Step 2:  POST /auth/verify-otp    → validates the code and returns a JWT

Legacy signup endpoint is preserved for user provisioning.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_connection, get_db, User, Role
from Schemas import (
    SignupRequest,
    OTPRequest,
    OTPVerify,
    TokenResponse,
    UserResponse,
    MessageResponse,
)
from Auth_utils import hash_password, create_access_token, send_otp_email


router = APIRouter(prefix="/auth", tags=["Auth"])


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNUP  (legacy — uses raw sqlite3, kept for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest):
    conn = get_connection()
    try:
        cur = conn.cursor()

        # Check duplicate email or username
        cur.execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (body.email, body.username)
        )
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email or username already registered."
            )

        # Resolve role_id from role name
        cur.execute("SELECT id FROM roles WHERE name = ?", (body.role,))
        role_row = cur.fetchone()
        if not role_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")

        # Insert user
        cur.execute(
            "INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)",
            (body.username, body.email, hash_password(body.password), role_row["id"])
        )
        conn.commit()
        return {"message": "Account created successfully."}
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — REQUEST OTP
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/request-otp", response_model=MessageResponse)
def request_otp(body: OTPRequest, db: Session = Depends(get_db)):
    """
    Generate a cryptographically secure 6-digit OTP, store it on the user
    record with a 5-minute expiry window, and email it to the user.

    Returns a generic 200 OK regardless of whether the email exists
    to prevent email enumeration attacks.
    """
    user = db.query(User).filter(User.email == body.email).first()

    if not user:
        # ── Anti-enumeration: return the same success message ──────────────────
        return {"message": "If this email is registered, an OTP has been sent."}

    if not user.is_active:
        # Deactivated accounts get the same generic response
        return {"message": "If this email is registered, an OTP has been sent."}

    # ── Generate 6-digit OTP (cryptographically secure) ────────────────────────
    otp_code = f"{secrets.randbelow(1_000_000):06d}"

    # ── Set expiry to 5 minutes from now (UTC) ─────────────────────────────────
    user.otp_code = otp_code
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.commit()

    # ── Send the OTP via email ─────────────────────────────────────────────────
    try:
        send_otp_email(user.email, otp_code)
    except RuntimeError:
        # Log the error in production; don't leak internal details to the client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP email. Please try again later.",
        )

    return {"message": "If this email is registered, an OTP has been sent."}


# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — VERIFY OTP & ISSUE JWT
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(body: OTPVerify, db: Session = Depends(get_db)):
    """
    Validate the submitted OTP against the stored code and expiry.

    Security measures:
      • secrets.compare_digest  → constant-time comparison (prevents timing attacks)
      • Immediate nullification → OTP cannot be reused after successful verification
      • Strict UTC comparison   → prevents timezone-related expiry bypass
    """
    user = (
        db.query(User)
        .filter(User.email == body.email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    # ── Guard: no OTP pending ──────────────────────────────────────────────────
    if not user.otp_code or not user.otp_expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No OTP has been requested for this account.",
        )

    # ── Guard: OTP expired ─────────────────────────────────────────────────────
    now_utc = datetime.now(timezone.utc)
    # Handle both naive (from SQLite) and aware datetimes safely
    expiry = user.otp_expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if now_utc > expiry:
        # Nullify the expired OTP so it cannot be retried
        user.otp_code = None
        user.otp_expires_at = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP has expired. Please request a new one.",
        )

    # ── Guard: OTP mismatch (constant-time comparison) ─────────────────────────
    if not secrets.compare_digest(user.otp_code, body.otp_code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP.",
        )

    # ── SUCCESS: Nullify OTP immediately (single-use) ──────────────────────────
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()

    # ── Resolve the role name for the JWT payload ──────────────────────────────
    role = db.query(Role).filter(Role.id == user.role_id).first()
    role_name = role.name if role else "user"

    # ── Issue JWT ──────────────────────────────────────────────────────────────
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": role_name,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=role_name,
            is_active=bool(user.is_active),
            created_at=user.created_at,
        ),
    }