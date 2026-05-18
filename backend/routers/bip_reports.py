"""
routers/bip_reports.py
──────────────────────
BIP Report configuration CRUD and Oracle execution pipeline.

Patched for multi-environment support: execution routes now filter
credentials by BOTH user_id AND env_name.
"""

import os
from typing import List, Tuple
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.responses import StreamingResponse

from database import get_db, BipReportConfig, OracleCredential
from dependencies import require_tool_access
from Schemas import (
    BipReportCreate,
    BipReportResponse,
    DirectBipSqlRequest,
    ExecutePresetQueryRequest,
    ExecuteReportsRequest,
    PresetBipQueryResponse,
)
from routers.integrations import encrypt_password, decrypt_password
from lib.config_generate import run_sqls_config_generation

router = APIRouter(
    prefix="/api/v1/bip-reports",
    tags=["BIP Reports"],
)

import logging
_logger = logging.getLogger(__name__)

DUAL_QUERY_SQL = (
    "SELECT USER AS ORACLE_USER, "
    "TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS CURRENT_TIMESTAMP "
    "FROM DUAL"
)


def _preset_query_catalog() -> list[dict[str, str]]:
    raw_targets = [
        {
            "id": "mary-david-dual",
            "target_label": "Mary.David Demo",
            "target_url": os.getenv("BIP_PRESET_TARGET_1_URL", "").strip(),
            "target_username": os.getenv("BIP_PRESET_TARGET_1_USERNAME", "").strip(),
            "target_password": os.getenv("BIP_PRESET_TARGET_1_PASSWORD", "").strip(),
        },
        {
            "id": "paul-anthony-dual",
            "target_label": "Paul.Anthony Demo",
            "target_url": os.getenv("BIP_PRESET_TARGET_2_URL", "").strip(),
            "target_username": os.getenv("BIP_PRESET_TARGET_2_USERNAME", "").strip(),
            "target_password": os.getenv("BIP_PRESET_TARGET_2_PASSWORD", "").strip(),
        },
        {
            "id": "nyssa-kestrel-dual",
            "target_label": "Nyssa.Kestrel Demo",
            "target_url": os.getenv("BIP_PRESET_TARGET_3_URL", "").strip(),
            "target_username": os.getenv("BIP_PRESET_TARGET_3_USERNAME", "").strip(),
            "target_password": os.getenv("BIP_PRESET_TARGET_3_PASSWORD", "").strip(),
        },
    ]

    presets: list[dict[str, str]] = []
    for target in raw_targets:
        if not target["target_url"] or not target["target_username"] or not target["target_password"]:
            continue

        presets.append(
            {
                **target,
                "module": target["target_label"],
                "report_name": f"{target['target_username']} DUAL Query",
                "description": (
                    f"Runs a lightweight Oracle DUAL query against {target['target_label']} "
                    "and returns live database values."
                ),
                "sql_query": DUAL_QUERY_SQL,
            }
        )

    return presets


def _public_preset_query(preset: dict[str, str]) -> PresetBipQueryResponse:
    return PresetBipQueryResponse(
        id=preset["id"],
        module=preset["module"],
        report_name=preset["report_name"],
        description=preset["description"],
        sql_query=preset["sql_query"],
        target_label=preset["target_label"],
        target_url=preset["target_url"],
        target_username=preset["target_username"],
    )


def _resolve_preset_query_or_404(preset_id: str) -> dict[str, str]:
    for preset in _preset_query_catalog():
        if preset["id"] == preset_id:
            return preset

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="The selected Oracle DUAL query preset is not available.",
    )


# ── Helper: Resolve credentials for a specific environment ────────────────────

def _get_oracle_credential(db: Session, user_id: int, env_name: str) -> OracleCredential:
    """
    Fetch the OracleCredential for a given user + env_name.
    Raises 404 if the environment is not found.
    """
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
            detail=f"Oracle environment '{env_name}' not found. Please configure it via Session Management.",
        )

    return credential


def _decrypt_credential(credential: OracleCredential) -> tuple[str, str, str]:
    """Returns (username, password, url) from a credential record."""
    try:
        password = decrypt_password(credential.encrypted_oracle_password)
        _logger.debug(
            f"Decrypted password OK — len={len(password)}, "
            f"starts='{password[:2]}***', "
            f"type={type(credential.encrypted_oracle_password).__name__}"
        )
    except Exception as e:
        _logger.error(f"Decryption failed for env={credential.env_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to decrypt Oracle credentials. Please reconnect your account.",
        )

    url = credential.oracle_url or "https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com/xmlpserver/services/ExternalReportWSSService"
    return credential.oracle_username, password, url


def _effective_sql_text(cfg: BipReportConfig) -> str | None:
    """Prefer plain-text sql_query; otherwise try Fernet-encrypted_sql_query."""
    if cfg.sql_query and str(cfg.sql_query).strip():
        return str(cfg.sql_query).strip()
    if cfg.encrypted_sql_query:
        try:
            plain = decrypt_password(cfg.encrypted_sql_query).strip()
            return plain or None
        except Exception:
            return None
    return None


# ═══════════════════════════════════════════════════════════════════════════════
#  CRUD
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/", response_model=BipReportResponse, status_code=status.HTTP_201_CREATED)
def create_bip_report(
    report_in: BipReportCreate,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """Create a new BIP Report configuration."""
    encrypted_sql = encrypt_password(report_in.sql_query) if report_in.sql_query else None
    
    new_report = BipReportConfig(
        module=report_in.module,
        sub_module=report_in.sub_module,
        report_name=report_in.report_name,
        description=report_in.description,
        encrypted_sql_query=encrypted_sql,
        sql_query="",
    )
    db.add(new_report)
    try:
        db.commit()
        db.refresh(new_report)
        return new_report
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A report configuration with this name already exists.",
        )


@router.get("/", response_model=List[BipReportResponse])
def list_bip_reports(
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """List all stored BIP report configurations."""
    return db.query(BipReportConfig).all()


@router.get("/preset-queries", response_model=List[PresetBipQueryResponse])
def list_preset_queries(
    current_user: dict = Depends(require_tool_access("bip_reporting")),
):
    """List fixed Oracle DUAL query presets without reading from the app database."""
    return [_public_preset_query(preset) for preset in _preset_query_catalog()]


# ═══════════════════════════════════════════════════════════════════════════════
#  EXECUTION PIPELINE (patched for multi-env)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/execute")
def execute_reports(
    body: ExecuteReportsRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    Execute selected BIP reports against a specific Oracle environment.
    Now filters credentials by BOTH user_id AND env_name.
    """
    user_id = int(current_user["sub"])

    # 1. Resolve credentials for the requested environment
    credential = _get_oracle_credential(db, user_id, body.env_name)
    username, password, oracle_url = _decrypt_credential(credential)

    # 2. Fetch SQL payloads from DB
    if not body.report_ids:
        raise HTTPException(status_code=400, detail="No report IDs provided.")

    configs = db.query(BipReportConfig).filter(BipReportConfig.id.in_(body.report_ids)).all()
    if not configs:
        raise HTTPException(status_code=404, detail="Requested reports not found.")

    sql_items: List[Tuple[str, str, str]] = []
    missing_sql: list[str] = []
    for cfg in configs:
        sql_text = _effective_sql_text(cfg)
        if not sql_text:
            missing_sql.append(cfg.report_name)
            continue
        sql_items.append((cfg.module, cfg.report_name, sql_text))

    if not sql_items:
        names = ", ".join(missing_sql) if missing_sql else "(unknown)"
        raise HTTPException(
            status_code=400,
            detail=(
                "None of the selected reports contain executable SQL. "
                f"Reports missing usable SQL: {names}. "
                "Open Save SQL Report and ensure the query is saved, or reconnect Oracle if credentials fail to decrypt."
            ),
        )

    # 3. Execute ETL
    excel_buffer, errors = run_sqls_config_generation(
        username=username,
        password=password,
        url=oracle_url,
        sql_items=sql_items,
    )

    if excel_buffer.getbuffer().nbytes == 0:
        raise HTTPException(
            status_code=500,
            detail=f"All reports failed to generate. Errors: {', '.join(errors)}",
        )

    excel_buffer.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="Oracle_Config_Extract.xlsx"'}
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post("/execute-preset")
def execute_preset_query(
    body: ExecutePresetQueryRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
):
    """
    Execute a predefined Oracle DUAL query using fixed credentials from environment variables.
    This flow bypasses saved BIP report configs entirely.
    """
    preset = _resolve_preset_query_or_404(body.preset_id)

    excel_buffer, errors = run_sqls_config_generation(
        username=preset["target_username"],
        password=preset["target_password"],
        url=preset["target_url"],
        sql_items=[(preset["module"], preset["report_name"], preset["sql_query"])],
    )

    if excel_buffer.getbuffer().nbytes == 0:
        raise HTTPException(
            status_code=500,
            detail=f"Preset query failed to generate. Errors: {', '.join(errors)}",
        )

    safe_name = "".join(
        ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in preset["report_name"]
    ).strip("_")

    excel_buffer.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{safe_name or "Oracle_DUAL_Query"}.xlsx"'}
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.post("/execute-sql")
def execute_direct_sql(
    body: DirectBipSqlRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    Run a one-off SQL query through Oracle BIP.
    Now resolves credentials by env_name for multi-environment support.
    """
    user_id = int(current_user["sub"])

    credential = _get_oracle_credential(db, user_id, body.env_name)
    username, password, oracle_url = _decrypt_credential(credential)

    excel_buffer, errors = run_sqls_config_generation(
        username=username,
        password=password,
        url=oracle_url,
        sql_items=[(body.module, body.report_name, body.sql_query)],
    )

    if excel_buffer.getbuffer().nbytes == 0:
        raise HTTPException(
            status_code=500,
            detail=f"Report failed to generate. Errors: {', '.join(errors)}",
        )

    safe_name = "".join(
        ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in body.report_name
    ).strip("_")

    excel_buffer.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{safe_name or "BIP_Report"}.xlsx"'}
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
