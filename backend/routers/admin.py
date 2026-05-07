"""
routers/admin.py
────────────────
Admin Control Panel (ACP) micro-service.

Provides real-time user management, role-filtered listing,
and the restriction "kill switch" for immediate account lockout.
All endpoints gated behind `require_admin` — only admins can access.
"""

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from Auth_utils import hash_password
from database import get_db, User, Role, UserToolAccess
from dependencies import TOOL_CATALOG, require_admin
from Schemas import (
    AdminUserCreateRequest,
    AdminUserUpdateRequest,
    ToolAccessResponse,
    UserAdminResponse,
    RestrictUserRequest,
    MessageResponse,
)


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin ACP"],
    dependencies=[Depends(require_admin)],  # Global RBAC — admin only
)


def _normalise_username(email: str, username: Optional[str]) -> str:
    if username:
        return username.strip()
    return email.split("@", 1)[0].strip()


def _set_tool_access(db: Session, user: User, tool_access: list[str]) -> None:
    user.tool_access.clear()
    for tool_key in tool_access:
        user.tool_access.append(UserToolAccess(tool_key=tool_key))
    db.flush()


def _to_admin_response(user: User) -> UserAdminResponse:
    role_name = user.role_rel.name if user.role_rel else "unknown"
    return UserAdminResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=role_name,
        created_at=user.created_at,
        last_active_at=user.last_active_at,
        total_active_seconds=user.total_active_seconds or 0,
        is_restricted=bool(user.is_restricted),
        tool_access=sorted(grant.tool_key for grant in user.tool_access),
    )


@router.get("/tools", response_model=list[ToolAccessResponse])
def list_assignable_tools(current_user: dict = Depends(require_admin)):
    """Return the canonical tool list that admins can assign to users."""
    return [
        ToolAccessResponse(key=key, label=value["label"], description=value["description"])
        for key, value in TOOL_CATALOG.items()
    ]


# ── GET /users ─────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminResponse])
def list_users(
    role: Optional[str] = Query(None, description="Filter by role name (admin, enterprise, user)"),
    search: Optional[str] = Query(None, description="Search by email or username (case-insensitive)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Return all users with optional role filtering and search.

    Query params:
      • role   — exact match on role name (e.g. ?role=enterprise)
      • search — partial, case-insensitive match on email OR username
    """
    query = db.query(User).join(Role, User.role_id == Role.id)

    # ── Role filter ────────────────────────────────────────────────────────────
    if role:
        query = query.filter(Role.name == role.lower())

    # ── Search filter (email or username) ──────────────────────────────────────
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            (User.email.ilike(search_term)) | (User.username.ilike(search_term))
        )

    users = query.all()

    # ── Map ORM → response (resolve role name) ────────────────────────────────
    results = []
    for user in users:
        role_name = user.role_rel.name if user.role_rel else "unknown"
        results.append(
            UserAdminResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                role=role_name,
                created_at=user.created_at,
                total_active_seconds=user.total_active_seconds or 0,
                is_restricted=bool(user.is_restricted),
                tool_access=sorted(grant.tool_key for grant in user.tool_access),
            )
        )

    return results


# ── PUT /users/{user_id}/restrict ──────────────────────────────────────────────

@router.post("/users", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminUserCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Create a user or enterprise account and assign selected tool access.

    Passwordless OTP login does not use password_hash, but the legacy schema
    requires it, so a cryptographically random placeholder is stored.
    """
    email = body.email.lower()
    username = _normalise_username(email, body.username)

    existing = (
        db.query(User)
        .filter(
            (func.lower(User.email) == email)
            | (func.lower(User.username) == username.lower())
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered.",
        )

    role = db.query(Role).filter(Role.name == body.role).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role.",
        )

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role_id=role.id,
        is_active=1,
    )
    db.add(user)
    db.flush()
    _set_tool_access(db, user, body.tool_access)
    db.commit()
    db.refresh(user)

    return _to_admin_response(user)


@router.put("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: int,
    body: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Update a user's role, assigned tools, and optional restriction state."""
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found.",
        )

    caller_id = int(current_user["sub"])
    if user.id == caller_id and body.is_restricted is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot restrict your own account.",
        )

    if body.role is not None:
        role = db.query(Role).filter(Role.name == body.role).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role.",
            )
        user.role_id = role.id

    if body.tool_access is not None:
        _set_tool_access(db, user, body.tool_access)

    if body.is_restricted is not None:
        user.is_restricted = body.is_restricted

    db.commit()
    db.refresh(user)

    return _to_admin_response(user)


@router.put("/users/{user_id}/restrict", response_model=MessageResponse)
def restrict_user(
    user_id: int,
    body: RestrictUserRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Admin Kill Switch — toggle a user's restricted status.

    Security: When is_restricted is set to True, the user is immediately
    blocked on their next API call via the get_verified_user dependency,
    regardless of JWT validity.
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found.",
        )

    # Prevent admins from restricting themselves
    caller_id = int(current_user["sub"])
    if user.id == caller_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot restrict your own account.",
        )

    user.is_restricted = body.is_restricted
    db.commit()

    action = "restricted" if body.is_restricted else "unrestricted"
    return {"message": f"User '{user.username}' has been {action} successfully."}
