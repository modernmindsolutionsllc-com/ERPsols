"""
routers/config_snapshot.py
──────────────────────────
Config Snapshot micro-service – Vertical Slice implementation.

• Accepts arbitrary JSON payloads from enterprise / admin users.
• Encrypts payloads using Fernet symmetric encryption before storage.
• Decrypts on retrieval, enforcing ownership (or admin override).
"""

import json
import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db, ConfigSnapshot
from dependencies import require_tool_access
from Schemas import ConfigSnapshotCreate, ConfigSnapshotResponse


# ── Fernet Cipher Initialisation ───────────────────────────────────────────────

FERNET_KEY = os.environ.get("FERNET_KEY")
if not FERNET_KEY:
    raise RuntimeError(
        "FERNET_KEY environment variable is not set. "
        "Generate one with:  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )
cipher = Fernet(FERNET_KEY.encode() if isinstance(FERNET_KEY, str) else FERNET_KEY)


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/api/v1/config",
    tags=["Config Snapshot"],
    dependencies=[Depends(require_tool_access("config_snapshot"))],
)


# ── POST /snapshot ─────────────────────────────────────────────────────────────

@router.post(
    "/snapshot",
    response_model=ConfigSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_snapshot(
    body: ConfigSnapshotCreate,
    current_user: dict = Depends(require_tool_access("config_snapshot")),
    db: Session = Depends(get_db),
):
    """
    Encrypt and persist an arbitrary JSON configuration payload.

    1. Serialise the dict → JSON string
    2. Encrypt with Fernet
    3. Store encrypted blob + user_id in the database
    """
    try:
        json_string = json.dumps(body.payload, separators=(",", ":"))
        encrypted_blob = cipher.encrypt(json_string.encode()).decode()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Encryption failed: {exc}",
        ) from exc

    snapshot = ConfigSnapshot(
        user_id=int(current_user["sub"]),
        encrypted_config=encrypted_blob,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    return ConfigSnapshotResponse(
        id=snapshot.id,
        user_id=snapshot.user_id,
        created_at=snapshot.created_at,
        payload=body.payload,
    )


# ── GET /snapshot/{snapshot_id} ────────────────────────────────────────────────

@router.get("/snapshot/{snapshot_id}", response_model=ConfigSnapshotResponse)
def get_snapshot(
    snapshot_id: int,
    current_user: dict = Depends(require_tool_access("config_snapshot")),
    db: Session = Depends(get_db),
):
    """
    Retrieve and decrypt a configuration snapshot.

    Ownership enforcement:
      • The snapshot's user_id must match the caller's ID.
      • Admins may read any snapshot.
    """
    snapshot = db.query(ConfigSnapshot).filter(ConfigSnapshot.id == snapshot_id).first()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Snapshot with id {snapshot_id} not found.",
        )

    # ── Ownership check (admin bypass) ─────────────────────────────────────────
    caller_id = int(current_user["sub"])
    caller_role = current_user.get("role")

    if snapshot.user_id != caller_id and caller_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this snapshot.",
        )

    # ── Decrypt ────────────────────────────────────────────────────────────────
    try:
        decrypted_bytes = cipher.decrypt(snapshot.encrypted_config.encode())
        payload = json.loads(decrypted_bytes.decode())
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt snapshot. The encryption key may have changed.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Decrypted data is not valid JSON.",
        ) from exc

    return ConfigSnapshotResponse(
        id=snapshot.id,
        user_id=snapshot.user_id,
        created_at=snapshot.created_at,
        payload=payload,
    )
