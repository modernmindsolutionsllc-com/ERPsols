from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from fastapi.responses import StreamingResponse

from database import get_db, BipReportConfig, OracleCredential
from dependencies import require_tool_access
from Schemas import BipReportCreate, BipReportResponse, DirectBipSqlRequest, ExecuteReportsRequest
from routers.integrations import decrypt_password
from lib.config_generate import run_sqls_config_generation

router = APIRouter(
    prefix="/api/v1/bip-reports",
    tags=["BIP Reports"],
)

@router.post("/", response_model=BipReportResponse, status_code=status.HTTP_201_CREATED)
def create_bip_report(
    report_in: BipReportCreate,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    Create a new BIP Report configuration.
    Requires Enterprise or Admin role.
    """
    new_report = BipReportConfig(
        module=report_in.module,
        sub_module=report_in.sub_module,
        report_name=report_in.report_name,
        description=report_in.description,
        sql_query=report_in.sql_query
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
            detail="A report configuration with this name already exists."
        )

@router.get("/", response_model=List[BipReportResponse])
def list_bip_reports(
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    List all stored BIP report configurations.
    Accessible by any authenticated user.
    """
    reports = db.query(BipReportConfig).all()
    return reports


@router.post("/execute")
def execute_reports(
    body: ExecuteReportsRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    Execute selected BIP reports against the Oracle environment securely.
    Returns the generated Excel file as a binary stream.
    """
    user_id = int(current_user["sub"])

    # 1. Fetch Oracle Credentials securely
    credential = db.query(OracleCredential).filter(OracleCredential.user_id == user_id).first()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Oracle credentials not found. Please connect your Oracle account first."
        )

    username = credential.oracle_username
    try:
        password = decrypt_password(credential.encrypted_oracle_password)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to decrypt Oracle credentials. Please reconnect your account."
        )

    oracle_url = credential.oracle_url or "https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com"

    # 2. Fetch SQL payloads from DB
    if not body.report_ids:
        raise HTTPException(status_code=400, detail="No report IDs provided.")

    configs = db.query(BipReportConfig).filter(BipReportConfig.id.in_(body.report_ids)).all()
    if not configs:
        raise HTTPException(status_code=404, detail="Requested reports not found.")

    sql_items = []
    for cfg in configs:
        sql_items.append((cfg.module, cfg.report_name, cfg.sql_query))

    # 3. Execute ETL
    excel_buffer, errors = run_sqls_config_generation(
        username=username,
        password=password,
        url=oracle_url,
        sql_items=sql_items
    )

    # If buffer is empty or 0 bytes, all queries failed.
    if excel_buffer.getbuffer().nbytes == 0:
        raise HTTPException(status_code=500, detail=f"All reports failed to generate. Errors: {', '.join(errors)}")

    headers = {
        "Content-Disposition": 'attachment; filename="Oracle_Config_Extract.xlsx"'
    }
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )


@router.post("/execute-sql")
def execute_direct_sql(
    body: DirectBipSqlRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
    db: Session = Depends(get_db)
):
    """
    Run a one-off SQL query through Oracle BIP and return the generated Excel file.
    This is intentionally scoped to the BIP Reporting page workflow.
    """
    user_id = int(current_user["sub"])

    credential = db.query(OracleCredential).filter(OracleCredential.user_id == user_id).first()
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Oracle credentials not found. Please connect your Oracle account first."
        )

    try:
        password = decrypt_password(credential.encrypted_oracle_password)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to decrypt Oracle credentials. Please reconnect your account."
        )

    excel_buffer, errors = run_sqls_config_generation(
        username=credential.oracle_username,
        password=password,
        url=credential.oracle_url or "https://fa-etaj-saasfademo1.ds-fa.oraclepdemos.com",
        sql_items=[(body.module, body.report_name, body.sql_query)]
    )

    if excel_buffer.getbuffer().nbytes == 0:
        raise HTTPException(status_code=500, detail=f"Report failed to generate. Errors: {', '.join(errors)}")

    safe_name = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in body.report_name).strip("_")
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_name or "BIP_Report"}.xlsx"'
    }
    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )
