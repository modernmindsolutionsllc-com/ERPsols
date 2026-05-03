from fastapi import APIRouter, HTTPException, status
from database import get_connection
from schemas import SignupRequest, LoginRequest, TokenResponse, UserResponse, MessageResponse
from auth_utils import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Signup ─────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest):
    conn = get_connection()
    try:
        cur = conn.cursor()

        # Check duplicate email or username
        cur.execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (body.email, body.username)
        )
        if cur.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email or username already registered."
            )

        # Resolve role_id from role name
        cur.execute("SELECT id FROM roles WHERE name = ?", (body.role,))
        role_row = cur.fetchone()
        if not role_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")

        # Insert user
        cur.execute(
            "INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)",
            (body.username, body.email, hash_password(body.password), role_row["id"])
        )
        conn.commit()
        return {"message": "Account created successfully."}
    finally:
        conn.close()


# ── Login ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.id, u.username, u.email, u.password_hash,
                   u.is_active, u.created_at, r.name AS role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = ?
            """,
            (body.email,)
        )
        user = cur.fetchone()

        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        if not user["is_active"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")

        if not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        token = create_access_token({
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"]
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": UserResponse(
                id=user["id"],
                username=user["username"],
                email=user["email"],
                role=user["role"],
                is_active=bool(user["is_active"]),
                created_at=user["created_at"]
            )
        }
    finally:
        conn.close()