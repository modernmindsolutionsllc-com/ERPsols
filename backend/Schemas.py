"""
Schemas.py
──────────
Pydantic models for request validation and response serialisation.
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Any, Dict, Literal
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTH SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Request Schemas ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Literal["admin", "enterprise", "user"] = "user"

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Username must be at least 3 characters.")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── OTP Schemas ────────────────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    """Step 1 — Client sends their email to receive a one-time code."""
    email: EmailStr


class OTPVerify(BaseModel):
    """Step 2 — Client submits the 6-digit code they received via email."""
    email: EmailStr
    otp_code: str

    @field_validator("otp_code")
    @classmethod
    def otp_must_be_six_digits(cls, v: str) -> str:
        if len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits.")
        return v


# ── Response Schemas ───────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIG SNAPSHOT SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ConfigSnapshotCreate(BaseModel):
    """
    Accepts an arbitrary JSON payload from the enterprise client.
    The entire dict will be serialised, encrypted, and stored.
    """
    payload: Dict[str, Any]


class ConfigSnapshotResponse(BaseModel):
    """
    Returns the decrypted snapshot back to the caller.
    """
    id: int
    user_id: int
    created_at: datetime
    payload: Dict[str, Any]

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════════
#  PAYROLL RECONCILIATION SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class PayrollUpload(BaseModel):
    """
    Upload payroll data for a specific month.
    The dict will be encrypted before storage.
    """
    month_year: str
    payroll_data: Dict[str, Any]


class PayrollResponse(BaseModel):
    """
    Returns the payroll record metadata and reconciliation status.
    """
    id: int
    month_year: str
    status: str

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════════
#  BIP REPORTING SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class BIPRequest(BaseModel):
    """
    Request payload for generating an Oracle BIP report.
    """
    report_name: str
    parameters: Dict[str, Any]