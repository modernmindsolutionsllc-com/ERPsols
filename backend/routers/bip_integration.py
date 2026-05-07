"""
routers/bip_integration.py
──────────────────────────
BIP (Business Intelligence Publisher) Reporting micro-service.

Simulates an ETL handshake with Oracle BIP via httpx AsyncClient.
All endpoints gated behind `require_enterprise` (admin + enterprise only).
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from dependencies import require_tool_access
from Schemas import BIPRequest


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/api/v1/bip",
    tags=["BIP Reporting"],
    dependencies=[Depends(require_tool_access("bip_reporting"))],
)

# Mock Oracle BIP endpoint (JSONPlaceholder simulates the handshake)
_MOCK_BIP_URL = "https://jsonplaceholder.typicode.com/posts/1"


# ── POST /generate-report ─────────────────────────────────────────────────────

@router.post("/generate-report")
async def generate_report(
    body: BIPRequest,
    current_user: dict = Depends(require_tool_access("bip_reporting")),
):
    """
    Simulate an ETL report generation request to Oracle BIP.

    Pipeline:
      1. Accept report_name and parameters from the client
      2. Make an async GET request to the mock BIP endpoint (simulating handshake)
      3. If the external server responds successfully → return mock download URL
      4. If the external server fails → return 502 Bad Gateway
    """

    # ── Step 1: Async handshake with mock Oracle BIP ───────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_MOCK_BIP_URL)
            response.raise_for_status()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Oracle BIP: {exc}",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Oracle BIP returned an error: {exc.response.status_code}",
        ) from exc

    # ── Step 2: Build response ─────────────────────────────────────────────────
    return {
        "status": "success",
        "report_name": body.report_name,
        "parameters": body.parameters,
        "bip_handshake": response.json(),
        "download_url": "https://oracle.bip.mock/download/12345.pdf",
        "requested_by": current_user.get("sub"),
    }
