"""
routers/payroll.py
──────────────────
Payroll Reconciliation micro-service.

• Encrypts payroll data with Fernet before storage (mirrors Config Snapshot pattern).
• Simulates reconciliation by inspecting decrypted data for discrepancies.
• All endpoints gated behind `require_enterprise` (admin + enterprise only).
"""

import json
import os
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db, PayrollRecord
from dependencies import require_enterprise
from Schemas import PayrollUpload, PayrollResponse


# ── Fernet Cipher (reuses the same FERNET_KEY as Config Snapshots) ─────────────

FERNET_KEY = os.environ.get("FERNET_KEY")
if not FERNET_KEY:
    raise RuntimeError(
        "FERNET_KEY environment variable is not set. "
        "Generate one with:  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )
cipher = Fernet(FERNET_KEY.encode() if isinstance(FERNET_KEY, str) else FERNET_KEY)


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/api/v1/payroll",
    tags=["Payroll Reconciliation"],
    dependencies=[Depends(require_enterprise)],  # Global RBAC gate
)


# ── POST /upload ───────────────────────────────────────────────────────────────

@router.post("/upload", response_model=PayrollResponse, status_code=status.HTTP_201_CREATED)
def upload_payroll(
    body: PayrollUpload,
    current_user: dict = Depends(require_enterprise),
    db: Session = Depends(get_db),
):
    """
    Encrypt and persist payroll data for a given month.

    1. Serialise payroll_data dict → JSON string
    2. Encrypt with Fernet
    3. Store encrypted blob with status "PENDING"
    """
    try:
        json_string = json.dumps(body.payroll_data, separators=(",", ":"))
        encrypted_blob = cipher.encrypt(json_string.encode()).decode()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Encryption failed: {exc}",
        ) from exc

    record = PayrollRecord(
        user_id=int(current_user["sub"]),
        encrypted_payroll_data=encrypted_blob,
        month_year=body.month_year,
        status="PENDING",
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return PayrollResponse(
        id=record.id,
        month_year=record.month_year,
        status=record.status,
    )


# ── GET /reconcile/{record_id} ────────────────────────────────────────────────

@router.get("/reconcile/{record_id}")
def reconcile_payroll(
    record_id: int,
    current_user: dict = Depends(require_enterprise),
    db: Session = Depends(get_db),
):
    """
    Fetch, decrypt, and reconcile a payroll record.

    Ownership enforcement:
      • record.user_id must match caller's ID
      • Admins may access any record

    Mock reconciliation logic:
      • If decrypted data contains a key "total_mismatch" → status = "DISCREPANCY_FOUND"
      • Otherwise → status = "RECONCILED"
    """
    record = db.query(PayrollRecord).filter(PayrollRecord.id == record_id).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payroll record with id {record_id} not found.",
        )

    # ── Ownership check (admin bypass) ─────────────────────────────────────────
    caller_id = int(current_user["sub"])
    caller_role = current_user.get("role")

    if record.user_id != caller_id and caller_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this payroll record.",
        )

    # ── Decrypt ────────────────────────────────────────────────────────────────
    try:
        decrypted_bytes = cipher.decrypt(record.encrypted_payroll_data.encode())
        payroll_data = json.loads(decrypted_bytes.decode())
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt payroll data. The encryption key may have changed.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Decrypted payroll data is not valid JSON.",
        ) from exc

    # ── Mock Reconciliation Logic ──────────────────────────────────────────────
    if "total_mismatch" in payroll_data:
        record.status = "DISCREPANCY_FOUND"
    else:
        record.status = "RECONCILED"

    db.commit()
    db.refresh(record)

    return {
        "status": record.status,
        "record_id": record.id,
        "month_year": record.month_year,
        "payroll_data": payroll_data,
        "reconciled_by": current_user.get("sub"),
    }
