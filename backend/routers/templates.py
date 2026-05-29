"""
routers/templates.py
────────────────────
Data Templates micro-service router.

Endpoints:
  GET  /download  — Retrieve a stored .xlsx template from the database.
  POST /upload    — Upsert a .xlsx template into the database (admin use).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db, DataTemplate
from dependencies import require_tool_access


router = APIRouter(
    prefix="/api/v1/templates",
    tags=["Data Templates"],
    dependencies=[Depends(require_tool_access("data_conversion"))],
)

# ── GET / ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_templates(db: Session = Depends(get_db)):
    """
    Return lightweight metadata for every stored template.
    Deliberately excludes the file_data (BYTEA) column to avoid
    sending megabytes of binary data to the browser.
    """
    rows = (
        db.query(
            DataTemplate.id,
            DataTemplate.module_name,
            DataTemplate.business_object,
            DataTemplate.file_name,
        )
        .order_by(DataTemplate.module_name, DataTemplate.business_object)
        .all()
    )
    return [
        {
            "id": r.id,
            "module_name": r.module_name,
            "business_object": r.business_object,
            "file_name": r.file_name,
        }
        for r in rows
    ]


# ── GET /download ──────────────────────────────────────────────────────────────

@router.get("/download")
def download_template(
    module: str,
    object: str,
    db: Session = Depends(get_db),
):
    """
    Download a data template Excel file from the database.
    """
    template = db.query(DataTemplate).filter(
        DataTemplate.module_name == module,
        DataTemplate.business_object == object,
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template not found for module '{module}' and object '{object}'.",
        )

    return Response(
        content=template.file_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{template.file_name}"'
        },
    )


# ── POST /upload ───────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_template(
    file: UploadFile = File(...),
    module_name: str = Form(...),
    business_object: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upsert a .xlsx data template into the database.

    If a template already exists for the given module_name + business_object
    (case-insensitive), its file data is replaced. Otherwise a new row is created.
    """
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are accepted.",
        )

    file_bytes = await file.read()

    # Case-insensitive lookup for existing template
    existing = db.query(DataTemplate).filter(
        DataTemplate.module_name.ilike(module_name),
        DataTemplate.business_object.ilike(business_object),
    ).first()

    if existing:
        existing.file_name = file.filename
        existing.file_data = file_bytes
        existing.created_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return {
            "message": f"Template updated for {module_name} / {business_object}.",
            "id": existing.id,
        }

    new_template = DataTemplate(
        module_name=module_name,
        business_object=business_object,
        file_name=file.filename,
        file_data=file_bytes,
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return {
        "message": f"Template created for {module_name} / {business_object}.",
        "id": new_template.id,
    }
