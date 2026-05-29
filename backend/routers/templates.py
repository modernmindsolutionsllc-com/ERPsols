"""
routers/templates.py
────────────────────
Data Templates micro-service router.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from database import get_db, DataTemplate
from dependencies import require_tool_access

router = APIRouter(
    prefix="/api/v1/templates",
    tags=["Data Templates"],
    dependencies=[Depends(require_tool_access("data_conversion"))],
)

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
        DataTemplate.business_object == object
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template not found for module '{module}' and object '{object}'."
        )

    return Response(
        content=template.file_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=\"{template.file_name}\""
        }
    )
