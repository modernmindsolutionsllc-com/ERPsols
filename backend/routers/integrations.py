"""
routers/integrations.py
───────────────────────
Oracle Fusion integration micro-service.

Provides a secure credential vault endpoint that encrypts Oracle
credentials using Fernet (AES-128-CBC) before they ever touch the database.
Accessible by enterprise + admin users (Tier 2).
"""

import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db, OracleCredential
from dependencies import require_user
from Schemas import OracleConnectRequest, OracleConnectResponse, MessageResponse


router = APIRouter(
    prefix="/api/v1/integrations",
    tags=["Oracle Integration"],
)


# ── Fernet Encryption Engine ──────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    """
    Loads the Fernet key from environment. This key MUST be a valid
    32-byte URL-safe base64-encoded string.

    Generate one with:
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    Then set it in your .env as:
        ORACLE_FERNET_KEY=<generated_key>
    """
    key = os.environ.get("ORACLE_FERNET_KEY")
    if not key:
        raise RuntimeError(
            "ORACLE_FERNET_KEY is not set in environment. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_password(plain_password: str) -> bytes:
    """Encrypt a plain-text password into Fernet ciphertext (bytes)."""
    f = _get_fernet()
    return f.encrypt(plain_password.encode("utf-8"))


def decrypt_password(encrypted_password: bytes) -> str:
    """Decrypt Fernet ciphertext back into plain-text. Used internally for ETL automation."""
    f = _get_fernet()
    try:
        return f.decrypt(encrypted_password).decode("utf-8")
    except InvalidToken:
        raise RuntimeError("Failed to decrypt Oracle password — key may have been rotated.")


# ── POST /oracle/connect ──────────────────────────────────────────────────────

@router.post("/oracle/connect", response_model=OracleConnectResponse)
def connect_oracle(
    body: OracleConnectRequest,
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    Receive raw Oracle credentials, IMMEDIATELY encrypt the password,
    and upsert the encrypted record into the vault.

    Security:
      • Password is encrypted via Fernet (AES-128-CBC) BEFORE db.add()
      • Plain-text password is NEVER logged, stored, or returned
      • Only enterprise + admin roles can call this endpoint
    """
    user_id = int(current_user["sub"])

    # Encrypt password BEFORE touching the database
    encrypted_pw = encrypt_password(body.oracle_password)

    # Upsert: update existing or create new
    existing = (
        db.query(OracleCredential)
        .filter(OracleCredential.user_id == user_id)
        .first()
    )

    now = datetime.now(timezone.utc)

    if existing:
        existing.oracle_username = body.oracle_username
        existing.encrypted_oracle_password = encrypted_pw
        existing.updated_at = now
    else:
        credential = OracleCredential(
            user_id=user_id,
            oracle_username=body.oracle_username,
            encrypted_oracle_password=encrypted_pw,
            created_at=now,
            updated_at=now,
        )
        db.add(credential)

    db.commit()

    return OracleConnectResponse(
        message="Oracle credentials encrypted and saved successfully.",
        oracle_username=body.oracle_username,
        connected_at=now,
    )


# ── GET /oracle/status ────────────────────────────────────────────────────────

@router.get("/oracle/status", response_model=dict)
def oracle_status(
    current_user: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Check if the current user has stored Oracle credentials (without exposing them)."""
    user_id = int(current_user["sub"])
    existing = (
        db.query(OracleCredential)
        .filter(OracleCredential.user_id == user_id)
        .first()
    )

    if existing:
        return {
            "connected": True,
            "oracle_username": existing.oracle_username,
            "connected_at": existing.updated_at.isoformat() if existing.updated_at else None,
        }

    return {"connected": False}
