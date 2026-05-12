"""
Schemas.py
──────────
Pydantic models for request validation and response serialisation.
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Any, Dict, Literal, Optional
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTH SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Literal["user"] = "user"

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


class OTPRequest(BaseModel):
    email: EmailStr


class OTPVerify(BaseModel):
    email: EmailStr
    otp_code: str

    @field_validator("otp_code")
    @classmethod
    def otp_must_be_six_digits(cls, v: str) -> str:
        if len(v) != 6 or not v.isdigit():
            raise ValueError("OTP must be exactly 6 digits.")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    tool_access: list[str] = []


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
    payload: Dict[str, Any]


class ConfigSnapshotResponse(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    payload: Dict[str, Any]
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════════
#  PAYROLL SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class PayrollUpload(BaseModel):
    month_year: str
    payroll_data: Dict[str, Any]


class PayrollResponse(BaseModel):
    id: int
    month_year: str
    status: str
    model_config = {"from_attributes": True}


class BIPRequest(BaseModel):
    report_name: str
    parameters: Dict[str, Any]


# ═══════════════════════════════════════════════════════════════════════════════
#  ADMIN CONTROL PANEL (ACP) SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

ToolKey = Literal["config_snapshot", "data_conversion", "payroll", "bip_reporting"]
AssignableRole = Literal["enterprise", "user"]


class ToolAccessResponse(BaseModel):
    key: ToolKey
    label: str
    description: str


class AdminUserUpdateRequest(BaseModel):
    role: Optional[AssignableRole] = None
    tool_access: Optional[list[ToolKey]] = None
    is_restricted: Optional[bool] = None

    @field_validator("tool_access")
    @classmethod
    def unique_tool_access_optional(cls, v: Optional[list[ToolKey]]) -> Optional[list[ToolKey]]:
        if v is None:
            return v
        return list(dict.fromkeys(v))


class UserAdminResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str
    created_at: datetime
    total_active_seconds: int
    is_restricted: bool
    tool_access: list[ToolKey] = []
    last_active_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class RestrictUserRequest(BaseModel):
    is_restricted: bool


class HeartbeatRequest(BaseModel):
    active_seconds: int

    @field_validator("active_seconds")
    @classmethod
    def must_be_positive(cls, v: int) -> int:
        if v < 0 or v > 300:
            raise ValueError("active_seconds must be between 0 and 300.")
        return v


class DisconnectRequest(BaseModel):
    token: str


# ═══════════════════════════════════════════════════════════════════════════════
#  ORACLE INTEGRATION SCHEMAS (Legacy – kept for backwards compat)
# ═══════════════════════════════════════════════════════════════════════════════

class OracleConnectRequest(BaseModel):
    oracle_url: str = "https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com"
    env_name: str = "Demo Oracle Fusion"
    oracle_username: str
    oracle_password: str

    @field_validator("oracle_username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Oracle username cannot be empty.")
        return v.strip()

    @field_validator("oracle_url")
    @classmethod
    def url_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Oracle URL cannot be empty.")
        return v.strip().rstrip("/")

    @field_validator("env_name")
    @classmethod
    def env_name_not_empty(cls, v: str) -> str:
        return v.strip() or "Demo Oracle Fusion"

    @field_validator("oracle_password")
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if len(v) < 1:
            raise ValueError("Oracle password cannot be empty.")
        return v


class OracleConnectResponse(BaseModel):
    message: str
    oracle_url: str
    env_name: str
    oracle_username: str
    connected_at: datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  ORACLE SESSION MANAGEMENT SCHEMAS (Multi-Environment — NEW)
# ═══════════════════════════════════════════════════════════════════════════════

class OracleSessionCreate(BaseModel):
    """Create/update an Oracle environment. Password encrypted via Fernet before DB write."""
    env_name: str
    old_env_name: Optional[str] = None
    oracle_url: str = "https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com"
    oracle_username: str
    oracle_password: str  # plain text in, encrypted before storage

    @field_validator("env_name", "oracle_username")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("This field cannot be empty.")
        return v.strip()

    @field_validator("oracle_url")
    @classmethod
    def url_clean(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Oracle URL cannot be empty.")
        return v.strip().rstrip("/")

    @field_validator("oracle_password")
    @classmethod
    def pw_not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("Oracle password cannot be empty.")
        return v


class OracleSessionResponse(BaseModel):
    """Returns session metadata. CRITICAL: password is NEVER included."""
    id: int
    env_name: str
    oracle_url: str
    oracle_username: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════════════════════
#  BIP REPORT CONFIG SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class BipReportBase(BaseModel):
    module: str
    sub_module: Optional[str] = None
    report_name: str
    description: Optional[str] = None


class BipReportCreate(BaseModel):
    module: str
    sub_module: Optional[str] = None
    report_name: str
    description: Optional[str] = None
    sql_query: str

    @field_validator("module", "report_name", "sql_query")
    @classmethod
    def required_text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("This field cannot be empty.")
        return v.strip()


class BipReportResponse(BipReportBase):
    id: int
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ExecuteReportsRequest(BaseModel):
    """Execute saved reports against a specific Oracle environment."""
    report_ids: list[int]
    env_name: str = "Demo Oracle Fusion"


class DirectBipSqlRequest(BaseModel):
    module: str = "Ad Hoc"
    report_name: str = "Ad Hoc SQL"
    sql_query: str
    env_name: str = "Demo Oracle Fusion"

    @field_validator("module", "report_name", "sql_query")
    @classmethod
    def required_text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("This field cannot be empty.")
        return v.strip()
