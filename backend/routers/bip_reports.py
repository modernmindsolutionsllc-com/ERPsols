"""
routers/bip_reports.py
──────────────────────
BIP Report configuration CRUD and Oracle execution pipeline.

Patched for multi-environment support: execution routes now filter
credentials by BOTH user_id AND env_name.
"""

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
    ExecuteReportsRequest,
    OracleCatalogImportRequest,
    OracleCatalogImportResponse,
)
from routers.integrations import encrypt_password, decrypt_password
from lib.config_generate import run_sqls_config_generation
from lib.bi_helper import import_oracle_catalog_queries

router = APIRouter(
    prefix="/api/v1/bip-reports",
    tags=["BIP Reports"],
)

import logging
_logger = logging.getLogger(__name__)


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


@router.post("/import-oracle-catalog", response_model=OracleCatalogImportResponse)
def import_oracle_catalog_reports(
    body: OracleCatalogImportRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db),
):
    """
    Read original Oracle BI Publisher data models, extract SQL datasets,
    and store them as local BIP report configurations under Validate Catalog.
    """
    user_id = int(current_user["sub"])
    credential = _get_oracle_credential(db, user_id, body.env_name)
    username, password, oracle_url = _decrypt_credential(credential)

    logs: list[str] = []

    def append_log(message: str) -> None:
        logs.append(message)

    try:
        imported = import_oracle_catalog_queries(
            username=username,
            password=password,
            url=oracle_url,
            source_folder=body.source_folder,
            append_log=append_log,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to import Oracle catalog queries: {exc}",
        ) from exc

    created_count = 0
    updated_count = 0
    saved_reports: list[BipReportConfig] = []

    for item in imported:
        report_name = str(item["report_name"]).strip()
        sql_query = str(item["sql_query"]).strip()
        if not report_name or not sql_query:
            continue

        encrypted_sql = encrypt_password(sql_query)
        existing = (
            db.query(BipReportConfig)
            .filter(BipReportConfig.report_name == report_name)
            .first()
        )

        if existing:
            existing.module = "Validate Catalog"
            existing.sub_module = item.get("sub_module")
            existing.description = item.get("description")
            existing.sql_query = ""
            existing.encrypted_sql_query = encrypted_sql
            existing.is_active = True
            saved_reports.append(existing)
            updated_count += 1
        else:
            new_report = BipReportConfig(
                module="Validate Catalog",
                sub_module=item.get("sub_module"),
                report_name=report_name,
                description=item.get("description"),
                sql_query="",
                encrypted_sql_query=encrypted_sql,
                is_active=True,
            )
            db.add(new_report)
            saved_reports.append(new_report)
            created_count += 1

    try:
        db.commit()
        for report in saved_reports:
            db.refresh(report)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Could not save imported catalog queries because one or more report names already conflict.",
        ) from exc

    append_log(
        f"Saved {len(saved_reports)} Validate Catalog report(s): "
        f"{created_count} created, {updated_count} updated"
    )

    return OracleCatalogImportResponse(
        imported_count=len(saved_reports),
        updated_count=updated_count,
        created_count=created_count,
        logs=logs,
        reports=saved_reports,
    )


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
