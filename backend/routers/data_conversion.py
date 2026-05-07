"""
routers/data_conversion.py
──────────────────────────
Data Conversion micro-service.

Accepts CSV or JSON file uploads, cleans the data using pandas,
and returns a sanitised preview. All endpoints are gated behind
`require_enterprise` (admin + enterprise roles only).
"""

import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from dependencies import require_tool_access


router = APIRouter(
    prefix="/api/v1/data",
    tags=["Data Conversion"],
    dependencies=[Depends(require_tool_access("data_conversion"))],
)

# Allowed file extensions
_ALLOWED_EXTENSIONS = {".csv", ".json"}


def _get_extension(filename: str | None) -> str:
    """Extract and lowercase the file extension, or raise 400."""
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file has no filename.",
        )
    dot_index = filename.rfind(".")
    if dot_index == -1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File has no extension. Allowed: .csv, .json",
        )
    return filename[dot_index:].lower()


# ── POST /upload ───────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_and_clean(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_tool_access("data_conversion")),
):
    """
    Upload a `.csv` or `.json` file for automated data cleaning.

    Pipeline:
      1. Validate file extension (.csv / .json only)
      2. Load into a pandas DataFrame
      3. Clean: drop empty rows → fill NaN with "N/A" → lowercase column names
      4. Return stats + a 5-row preview
    """

    # ── Step 1: Validate extension ─────────────────────────────────────────────
    ext = _get_extension(file.filename)
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: .csv, .json",
        )

    # ── Step 2: Read file contents ─────────────────────────────────────────────
    try:
        contents = await file.read()
        buffer = io.BytesIO(contents)

        if ext == ".csv":
            df = pd.read_csv(buffer)
        else:  # .json
            df = pd.read_json(buffer)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse file: {exc}",
        ) from exc

    original_row_count = len(df)

    # ── Step 3: Clean the data ─────────────────────────────────────────────────

    # Drop rows that are entirely empty
    df.dropna(how="all", inplace=True)

    # Fill remaining NaN values with "N/A"
    df.fillna("N/A", inplace=True)

    # Normalise column names to lowercase
    df.columns = [col.strip().lower() for col in df.columns]

    cleaned_row_count = len(df)

    # ── Step 4: Build response ─────────────────────────────────────────────────
    preview = df.head(5).to_dict(orient="records")

    return {
        "status": "success",
        "original_row_count": original_row_count,
        "cleaned_row_count": cleaned_row_count,
        "columns": list(df.columns),
        "preview": preview,
        "uploaded_by": current_user.get("sub"),
    }
