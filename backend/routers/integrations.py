"""
routers/integrations.py
───────────────────────
Oracle Fusion integration micro-service.

Provides a secure credential vault with FULL CRUD for multi-environment
Oracle sessions. Passwords are encrypted using Fernet (AES-128-CBC)
before they ever touch the database.

Endpoints:
  GET    /oracle/sessions         → List all sessions for the user
  POST   /oracle/sessions         → Create or update an environment
  DELETE /oracle/sessions/{name}  → Delete a specific environment
  DELETE /oracle/sessions         → Wipe ALL sessions for the user
  POST   /oracle/connect          → Legacy single-connect (preserved)
  GET    /oracle/status           → Connection status check
"""

import os
from datetime import datetime, timezone
from typing import List

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db, OracleCredential
from dependencies import require_user
from Schemas import (
    OracleConnectRequest,
    OracleConnectResponse,
    OracleSessionCreate,
    OracleSessionResponse,
    MessageResponse,
)


router = APIRouter(
    prefix="/api/v1/integrations",
    tags=["Oracle Integration"],
)


# ── Fernet Encryption Engine ──────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    key = os.environ.get("ORACLE_FERNET_KEY")
    if not key:
        raise RuntimeError(
            "ORACLE_FERNET_KEY is not set in environment. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def encrypt_password(plain_password: str) -> bytes:
    """Encrypt a plain-text password into Fernet ciphertext (bytes)."""
    f = _get_fernet()
    return f.encrypt(plain_password.encode("utf-8"))


def decrypt_password(encrypted_password: bytes) -> str:
    """Decrypt Fernet ciphertext back into plain-text. Used internally for ETL."""
    f = _get_fernet()
    try:
        return f.decrypt(encrypted_password).decode("utf-8")
    except InvalidToken:
        raise RuntimeError("Failed to decrypt Oracle password — key may have been rotated.")


# ── Intelligent URL Formatter ─────────────────────────────────────────────────

_BIP_WSDL_SUFFIX = "/xmlpserver/services/ExternalReportWSSService"


def normalize_oracle_url(raw_url: str) -> str:
    """
    Convert any Oracle Cloud base URL into the correct BIP SOAP WSDL endpoint.

    Handles three cases:
      1. Already complete  → return as-is
      2. Ends with /xmlpserver → append /services/ExternalReportWSSService
      3. Base URL only     → append full /xmlpserver/services/ExternalReportWSSService
    """
    url = raw_url.strip().rstrip("/")

    if url.endswith(_BIP_WSDL_SUFFIX):
        return url

    if url.endswith("/xmlpserver"):
        return url + "/services/ExternalReportWSSService"

    return url + _BIP_WSDL_SUFFIX


# ═══════════════════════════════════════════════════════════════════════════════
#  MULTI-ENVIRONMENT SESSION CRUD
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/oracle/sessions", response_model=List[OracleSessionResponse])
def list_oracle_sessions(
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Return all Oracle environment sessions for the authenticated user."""
    user_id = int(current_user["sub"])
    sessions = (
        db.query(OracleCredential)
        .filter(OracleCredential.user_id == user_id)
        .order_by(OracleCredential.created_at.desc())
        .all()
    )
    return sessions


@router.post("/oracle/sessions", response_model=OracleSessionResponse)
def upsert_oracle_session(
    body: OracleSessionCreate,
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    Create or update an Oracle environment session.

    If env_name already exists for this user, the existing record is
    updated (upsert). Password is encrypted via Fernet BEFORE db write.
    """
    user_id = int(current_user["sub"])
    normalized_url = normalize_oracle_url(body.oracle_url)
    encrypted_pw = encrypt_password(body.oracle_password)
    now = datetime.now(timezone.utc)

    lookup_name = body.old_env_name if body.old_env_name else body.env_name
    existing = (
        db.query(OracleCredential)
        .filter(
            OracleCredential.user_id == user_id,
            OracleCredential.env_name == lookup_name,
        )
        .first()
    )

    if existing:
        existing.env_name = body.env_name
        existing.oracle_url = normalized_url
        existing.oracle_username = body.oracle_username
        existing.encrypted_oracle_password = encrypted_pw
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return existing
    else:
        credential = OracleCredential(
            user_id=user_id,
            env_name=body.env_name,
            oracle_url=normalized_url,
            oracle_username=body.oracle_username,
            encrypted_oracle_password=encrypted_pw,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(credential)
        db.commit()
        db.refresh(credential)
        return credential


@router.delete("/oracle/sessions/{env_name}", response_model=MessageResponse)
def delete_oracle_session(
    env_name: str,
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Delete a specific Oracle environment session by env_name."""
    user_id = int(current_user["sub"])
    credential = (
        db.query(OracleCredential)
        .filter(
            OracleCredential.user_id == user_id,
            OracleCredential.env_name == env_name,
        )
        .first()
    )

    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Oracle environment '{env_name}' not found.",
        )

    db.delete(credential)
    db.commit()
    return MessageResponse(message=f"Oracle environment '{env_name}' deleted successfully.")


@router.delete("/oracle/sessions", response_model=MessageResponse)
def delete_all_oracle_sessions(
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Wipe ALL Oracle sessions for the authenticated user."""
    user_id = int(current_user["sub"])
    count = (
        db.query(OracleCredential)
        .filter(OracleCredential.user_id == user_id)
        .delete()
    )
    db.commit()
    return MessageResponse(message=f"Deleted {count} Oracle environment(s) from the vault.")


# ═══════════════════════════════════════════════════════════════════════════════
#  LEGACY ENDPOINTS (preserved for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/oracle/connect", response_model=OracleConnectResponse)
def connect_oracle(
    body: OracleConnectRequest,
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    Legacy single-connect endpoint. Now delegates to the multi-env upsert
    logic internally so data stays consistent.
    """
    user_id = int(current_user["sub"])
    normalized_url = normalize_oracle_url(body.oracle_url)
    encrypted_pw = encrypt_password(body.oracle_password)
    now = datetime.now(timezone.utc)

    existing = (
        db.query(OracleCredential)
        .filter(
            OracleCredential.user_id == user_id,
            OracleCredential.env_name == body.env_name,
        )
        .first()
    )

    if existing:
        existing.oracle_url = normalized_url
        existing.oracle_username = body.oracle_username
        existing.encrypted_oracle_password = encrypted_pw
        existing.updated_at = now
    else:
        credential = OracleCredential(
            user_id=user_id,
            env_name=body.env_name,
            oracle_url=normalized_url,
            oracle_username=body.oracle_username,
            encrypted_oracle_password=encrypted_pw,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(credential)

    db.commit()

    return OracleConnectResponse(
        message="Oracle credentials encrypted and saved successfully.",
        oracle_url=normalized_url,
        env_name=body.env_name,
        oracle_username=body.oracle_username,
        connected_at=now,
    )


@router.get("/oracle/status", response_model=dict)
def oracle_status(
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Check if the current user has any stored Oracle credentials."""
    user_id = int(current_user["sub"])

    # Return the most recently updated session
    existing = (
        db.query(OracleCredential)
        .filter(OracleCredential.user_id == user_id)
        .order_by(OracleCredential.updated_at.desc())
        .first()
    )

    if existing:
        return {
            "connected": True,
            "oracle_url": existing.oracle_url,
            "env_name": existing.env_name,
            "oracle_username": existing.oracle_username,
            "connected_at": existing.updated_at.isoformat() if existing.updated_at else None,
        }

    return {"connected": False}
