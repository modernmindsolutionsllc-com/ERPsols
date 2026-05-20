"""
database.py
────────────
Hybrid database layer:
  • Raw sqlite3 connection  → consumed by the legacy Auth.py module
  • SQLAlchemy ORM engine    → consumed by all new micro-service routers

Both point at the same physical SQLite file so data is consistent.
"""

import sqlite3
import os
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine,
    Boolean,
    Column,
    Integer,
    LargeBinary,
    String,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship


# ── Shared DB path ─────────────────────────────────────────────────────────────

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_db_path(raw_path: str) -> str:
    if os.path.isabs(raw_path):
        return raw_path
    return os.path.join(BACKEND_DIR, raw_path)


DB_PATH = _resolve_db_path(os.getenv("DB_PATH", "app.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"


def _bootstrap_admin_emails() -> list[str]:
    raw_emails = os.getenv("BOOTSTRAP_ADMIN_EMAILS", "")
    return [
        email.strip().lower()
        for email in raw_emails.split(",")
        if email.strip()
    ]


# ═══════════════════════════════════════════════════════════════════════════════
#  RAW SQLITE3 LAYER  (consumed by Auth.py — DO NOT REMOVE)
# ═══════════════════════════════════════════════════════════════════════════════

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ═══════════════════════════════════════════════════════════════════════════════
#  SQLALCHEMY ORM LAYER
# ═══════════════════════════════════════════════════════════════════════════════

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite + FastAPI
)

# Enable foreign keys for every raw DBAPI connection SQLAlchemy opens
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── ORM Models ─────────────────────────────────────────────────────────────────

class Role(Base):
    __tablename__ = "roles"

    id   = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)

    users = relationship("User", back_populates="role_rel")


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String, unique=True, nullable=False)
    email         = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role_id       = Column(Integer, ForeignKey("roles.id"), nullable=False, default=3)
    is_active     = Column(Integer, nullable=False, default=1)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # ── OTP fields ─────────────────────────────────────────────────────────────
    otp_code       = Column(String, nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)

    # ── ACP fields (Admin Control Panel) ───────────────────────────────────────
    total_active_seconds = Column(Integer, nullable=False, default=0)
    is_restricted        = Column(Boolean, nullable=False, default=False)
    last_active_at       = Column(DateTime(timezone=True), nullable=True)

    role_rel           = relationship("Role", back_populates="users")
    tool_access        = relationship("UserToolAccess", back_populates="user", cascade="all, delete-orphan")
    snapshots          = relationship("ConfigSnapshot", back_populates="owner")
    payroll_records    = relationship("PayrollRecord", back_populates="owner")
    oracle_credentials = relationship("OracleCredential", back_populates="user", cascade="all, delete-orphan")


class UserToolAccess(Base):
    __tablename__ = "user_tool_access"
    __table_args__ = (
        UniqueConstraint("user_id", "tool_key", name="uq_user_tool_access_user_tool"),
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    tool_key = Column(String, nullable=False)

    user = relationship("User", back_populates="tool_access")


class ConfigSnapshot(Base):
    __tablename__ = "config_snapshots"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    encrypted_config = Column(Text, nullable=False)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="snapshots")


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    id                     = Column(Integer, primary_key=True, autoincrement=True)
    user_id                = Column(Integer, ForeignKey("users.id"), nullable=False)
    encrypted_payroll_data = Column(Text, nullable=False)
    month_year             = Column(String, nullable=False)
    status                 = Column(String, nullable=False, default="PENDING")
    created_at             = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="payroll_records")


# ── Oracle Credentials (Multi-Tenant: One User → Many Environments) ────────────

class OracleCredential(Base):
    """
    Stores Fernet-encrypted Oracle Fusion credentials.
    Supports multi-tenancy: each user can store credentials for multiple
    environments (e.g., Production, UAT, Development).

    The encrypted_oracle_password column holds AES-encrypted ciphertext
    — the plain text password NEVER touches the database.
    """
    __tablename__ = "oracle_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", "env_name", name="uq_oracle_user_env"),
    )

    id                        = Column(Integer, primary_key=True, autoincrement=True)
    user_id                   = Column(Integer, ForeignKey("users.id"), nullable=False)
    env_name                  = Column(String, nullable=False, default="Demo Oracle Fusion")
    oracle_url                = Column(String, nullable=False, default="https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com")
    oracle_username           = Column(String, nullable=False)
    encrypted_oracle_password = Column(String, nullable=False)
    is_active                 = Column(Boolean, nullable=False, default=True)
    created_at                = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at                = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                                      onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="oracle_credentials")


class BipReportConfig(Base):
    __tablename__ = "bip_report_configs"

    id          = Column(Integer, primary_key=True, index=True, autoincrement=True)
    module      = Column(String, index=True, nullable=False)
    sub_module  = Column(String, nullable=True)
    report_name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    sql_query   = Column(Text, nullable=True)
    encrypted_sql_query = Column(String, nullable=True)
    is_active   = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class BiCatalogSetupData(Base):
    """
    Stores base64-encoded Oracle BI report/data-model definitions that
    validate_catalog() deploys into the target environment.
    """
    __tablename__ = "bi_catalog_setup_data"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    bi_object_abs_path  = Column(String, nullable=False, unique=True)
    bi_object_type      = Column(String, nullable=False)
    bi_object_base64_data = Column(Text, nullable=False)


# ── DB Session ─────────────────────────────────────────────────────────────────

def get_db():
    """
    FastAPI dependency that yields a scoped SQLAlchemy session.
    Usage in routers:  db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
#  INITIALISATION
# ═══════════════════════════════════════════════════════════════════════════════

def _safe_alter_columns(cursor: sqlite3.Cursor, table_name: str, columns: list[tuple[str, str]]) -> None:
    for col_name, col_type in columns:
        try:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")
        except sqlite3.OperationalError:
            pass


def init_db():
    """
    Two-phase init:
      1. Raw SQL  → creates roles & users tables, seeds role data
                    (keeps Auth.py happy)
      2. SQLAlchemy → creates any NEW tables (config_snapshots,
                       payroll_records, etc.) and
                      ALTERs existing tables with new columns (otp_*)
    """

    # ── Phase 1: Legacy raw-SQL bootstrap ──────────────────────────────────────
    conn = get_connection()
    cursor = conn.cursor()

    # --- Roles table ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    """)

    # Seed roles (ignore if already present)
    cursor.executemany(
        "INSERT OR IGNORE INTO roles (name) VALUES (?)",
        [("admin",), ("enterprise",), ("user",)]
    )

    # --- Users table ---
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            email         TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            role_id       INTEGER NOT NULL DEFAULT 3,
            is_active     INTEGER NOT NULL DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (role_id) REFERENCES roles(id)
        )
    """)

    # --- Add new columns to existing users table (safe migration) ──────────────
    _migration_cols = [
        ("otp_code",             "TEXT"),
        ("otp_expires_at",       "DATETIME"),
        ("total_active_seconds", "INTEGER DEFAULT 0"),
        ("is_restricted",        "INTEGER DEFAULT 0"),   # SQLite stores bool as int
        ("last_active_at",       "DATETIME"),
    ]
    for col_name, col_type in _migration_cols:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
        except sqlite3.OperationalError:
            pass  # Column already exists — skip silently

    admin_emails = _bootstrap_admin_emails()
    if admin_emails:
        cursor.execute("SELECT id FROM roles WHERE name = ?", ("admin",))
        admin_role = cursor.fetchone()
        if admin_role:
            cursor.executemany(
                "UPDATE users SET role_id = ? WHERE lower(email) = ?",
                [(admin_role["id"], email) for email in admin_emails],
            )

    conn.commit()
    conn.close()

    # ── Phase 2: SQLAlchemy create new tables (config_snapshots, etc.) ─────────
    Base.metadata.create_all(bind=engine)

    # ── Phase 3: Safe ALTER migrations for columns added after initial release ─
    conn = get_connection()
    cursor = conn.cursor()
    _safe_alter_columns(cursor, "oracle_credentials", [
        ("env_name", "TEXT DEFAULT 'Demo Oracle Fusion'"),
        ("oracle_url", "TEXT DEFAULT 'https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com'"),
        ("is_active", "INTEGER DEFAULT 1"),
    ])
    _safe_alter_columns(cursor, "bip_report_configs", [
        ("sub_module", "TEXT"),
        ("description", "TEXT"),
        ("encrypted_sql_query", "BLOB"),
        ("is_active", "INTEGER DEFAULT 1"),
    ])

    # ── Drop the old unique constraint on user_id only (migrate to multi-env) ──
    # SQLite doesn't support DROP CONSTRAINT, so we check if the old index exists
    # and drop it. The new UniqueConstraint (user_id, env_name) is created by
    # Base.metadata.create_all() above.
    try:
        cursor.execute("DROP INDEX IF EXISTS ix_oracle_credentials_user_id")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

    print("Database initialised successfully.")


if __name__ == "__main__":
    init_db()
