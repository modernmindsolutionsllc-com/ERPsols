"""
Auth.py
───────
Authentication router — Passwordless OTP flow.

Step 1:  POST /auth/request-otp   → generates & emails a 6-digit code
Step 2:  POST /auth/verify-otp    → validates the code and returns a JWT

Legacy signup endpoint is preserved for user provisioning.
"""

import secrets
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_connection, get_db, User, Role, UserToolAccess
from Schemas import (
    SignupRequest,
    OTPRequest,
    OTPVerify,
    TokenResponse,
    UserResponse,
    MessageResponse,
    OTPRequestResponse,
    AddToolRequest,
)
from Auth_utils import hash_password, create_access_token, send_otp_email
from dependencies import get_verified_user
from make_admins import is_bootstrap_admin_email


router = APIRouter(prefix="/auth", tags=["Auth"])


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _auto_promote_admin_if_allowlisted(user: User, db: Session) -> None:
    if not is_bootstrap_admin_email(user.email):
        return

    admin_role = db.query(Role).filter(Role.name == "admin").first()
    if not admin_role:
        admin_role = Role(name="admin")
        db.add(admin_role)
        db.flush()

    changed = False
    if user.role_id != admin_role.id:
        user.role_id = admin_role.id
        changed = True
    if not user.is_active:
        user.is_active = 1
        changed = True
    if bool(user.is_restricted):
        user.is_restricted = False
        changed = True

    if changed:
        db.flush()


# ═══════════════════════════════════════════════════════════════════════════════
#  SIGNUP  (SQLAlchemy persistent transaction model)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    """
    Register a new user account cleanly through SQLAlchemy ORM, ensuring
    strict transaction boundary handling and database persistence.
    """
    # Check duplicate email or username
    existing_user = db.query(User).filter(
        (User.email == body.email) | (User.username == body.username)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered."
        )

    # Resolve default role (user)
    role = db.query(Role).filter(Role.name == "user").first()
    if not role:
        role = Role(name="user")
        db.add(role)
        db.flush()

    # Create new user record
    new_user = User(
        username=body.username,
        email=body.email,
        password_hash="OTP_ONLY",
        role_id=role.id,
        is_active=1,
        is_restricted=False,
    )

    try:
        db.add(new_user)
        _auto_promote_admin_if_allowlisted(new_user, db)
        db.commit()
        db.refresh(new_user)
        return {"message": "Account created successfully."}
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during signup: {exc}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — REQUEST OTP
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/request-otp", response_model=OTPRequestResponse)
def request_otp(body: OTPRequest, db: Session = Depends(get_db)):
    """
    Generate a cryptographically secure 6-digit OTP, store it on the user
    record with a 5-minute expiry window, and email it to the user.

    Returns a generic 200 OK regardless of whether the email exists
    to prevent email enumeration attacks.
    """
    user = db.query(User).filter(User.email == body.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Please sign up first!"
        )

    _auto_promote_admin_if_allowlisted(user, db)

    if not user.is_active:
        # Deactivated accounts get the same generic response
        return {"message": "If this email is registered, an OTP has been sent."}

    # ── Guard: restricted accounts are blocked before OTP is sent ──────────────
    if user.is_restricted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ACCOUNT_RESTRICTED",
        )

    # ── Generate 6-digit OTP (cryptographically secure) ────────────────────────
    otp_code = f"{secrets.randbelow(1_000_000):06d}"

    # ── Set expiry to 5 minutes from now (UTC) ─────────────────────────────────
    user.otp_code = otp_code
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.commit()

    if _env_flag("OTP_BYPASS_EXISTING_USERS"):
        return {
            "message": "Temporary login bypass is active for this account.",
            "dev_otp": otp_code,
            "bypass_login": True,
        }

    # ── Send the OTP via email ─────────────────────────────────────────────────
    try:
        send_otp_email(user.email, otp_code)
    except RuntimeError:
        if not _env_flag("DEV_OTP_FALLBACK"):
            # Log the error in production; don't leak internal details to the client
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send OTP email. Please try again later.",
            )

        response: dict[str, str] = {
            "message": "OTP email delivery failed. Using local development fallback code."
        }
        if _env_flag("EXPOSE_DEV_OTP"):
            response["dev_otp"] = otp_code
        return {**response, "bypass_login": False}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send OTP email. Please try again later.",
        ) from exc

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

    _auto_promote_admin_if_allowlisted(user, db)
    # ── Guard: account restricted (may have been restricted after OTP was sent) ─
    if user.is_restricted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ACCOUNT_RESTRICTED",
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
    tool_access = sorted(
        grant.tool_key
        for grant in db.query(UserToolAccess).filter(UserToolAccess.user_id == user.id).all()
    )

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
            tool_access=tool_access,
        ),
    }


@router.post("/workspace/tools", response_model=UserResponse)
def add_workspace_tool(
    body: AddToolRequest,
    current_user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db)
):
    """Associate a tool (e.g. 'bip_reporting') with the authenticated user's workspace."""
    user_id = int(current_user["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    
    # Check if access already exists
    existing = db.query(UserToolAccess).filter(
        UserToolAccess.user_id == user_id,
        UserToolAccess.tool_key == body.tool_key
    ).first()
    
    if not existing:
        new_access = UserToolAccess(user_id=user_id, tool_key=body.tool_key)
        db.add(new_access)
        db.commit()
        db.refresh(user)
    
    role = db.query(Role).filter(Role.id == user.role_id).first()
    role_name = role.name if role else "user"
    tool_access = sorted(
        grant.tool_key
        for grant in db.query(UserToolAccess).filter(UserToolAccess.user_id == user.id).all()
    )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=role_name,
        is_active=bool(user.is_active),
        created_at=user.created_at,
        tool_access=tool_access,
    )


