"""
dependencies.py
────────────────
Centralised RBAC gatekeepers for the application.
Each dependency validates the caller's JWT-derived role against
the minimum privilege tier required by the route / router.
"""

from fastapi import Depends, HTTPException, status
from Auth_utils import get_current_user


# ── Tier 1 – Admin Only ───────────────────────────────────────────────────────

def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Strictly requires the caller to hold the **admin** role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin privileges required.",
        )
    return current_user


# ── Tier 2 – Enterprise + Admin ───────────────────────────────────────────────

def require_enterprise(current_user: dict = Depends(get_current_user)) -> dict:
    """Requires the caller to hold either **admin** or **enterprise** role."""
    if current_user.get("role") not in ("admin", "enterprise"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Enterprise or Admin privileges required.",
        )
    return current_user


# ── Tier 3 – Any Authenticated User ──────────────────────────────────────────

def require_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Requires the caller to hold any valid role (admin, enterprise, or user)."""
    if current_user.get("role") not in ("admin", "enterprise", "user"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Valid user role required.",
        )
    return current_user
