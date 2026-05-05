"""
Auth_utils.py
─────────────
Security utilities: JWT management, password hashing, OTP email delivery,
and FastAPI dependency injection for authentication & RBAC.
"""

import hashlib
import hmac
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer


SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/verify-otp")


# ═══════════════════════════════════════════════════════════════════════════════
#  PASSWORD HASHING  (kept for signup / legacy compat)
# ═══════════════════════════════════════════════════════════════════════════════

# Password hashing
def hash_password(password: str) -> str:
    """Create an HMAC-SHA256 password hash."""
    return hmac.new(SECRET_KEY.encode(), password.encode(), hashlib.sha256).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(plain), hashed)


# ═══════════════════════════════════════════════════════════════════════════════
#  JWT HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

# JWT helpers
def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise credentials_exception from exc


# Current user dependency
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    return decode_access_token(token)


# Role guard factory
def require_role(*allowed_roles: str):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker


# ═══════════════════════════════════════════════════════════════════════════════
#  OTP EMAIL DELIVERY
# ═══════════════════════════════════════════════════════════════════════════════

def send_otp_email(user_email: str, otp_code: str) -> None:
    """
    Send a 6-digit OTP login code to the user via Gmail SMTP (SSL, port 465).

    Reads SENDER_EMAIL and SENDER_EMAIL_PASSWORD from environment variables.
    Raises RuntimeError if credentials are missing or delivery fails.
    """
    sender_email = os.environ.get("SENDER_EMAIL")
    sender_password = os.environ.get("SENDER_EMAIL_PASSWORD")

    if not sender_email or not sender_password:
        raise RuntimeError(
            "SENDER_EMAIL and SENDER_EMAIL_PASSWORD must be set in environment."
        )

    # ── Build the email ────────────────────────────────────────────────────────
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "MMSLLC Secure Admin Portal - Login Code"
    msg["From"] = sender_email
    msg["To"] = user_email

    # Plain-text fallback
    text_body = (
        f"Your MMSLLC login code is: {otp_code}\n\n"
        f"This code expires in 5 minutes.\n"
        f"If you did not request this, please ignore this email."
    )

    # HTML version (premium look)
    html_body = f"""\
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f0f; padding: 40px;">
      <div style="max-width: 480px; margin: 0 auto; background: #1a1a2e; border-radius: 12px;
                  padding: 40px; border: 1px solid #2a2a4a;">
        <h2 style="color: #e0e0e0; margin: 0 0 8px 0; font-size: 18px;">
          🔐 MMSLLC Secure Portal
        </h2>
        <p style="color: #8888aa; font-size: 14px; margin: 0 0 30px 0;">
          Your one-time login code
        </p>
        <div style="background: #16213e; border-radius: 8px; padding: 20px; text-align: center;
                    border: 1px solid #0f3460;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #00d4ff;
                       font-family: 'Courier New', monospace;">
            {otp_code}
          </span>
        </div>
        <p style="color: #8888aa; font-size: 13px; margin: 24px 0 0 0; text-align: center;">
          This code expires in <strong style="color: #ff6b6b;">5 minutes</strong>.
        </p>
        <hr style="border: none; border-top: 1px solid #2a2a4a; margin: 24px 0;" />
        <p style="color: #555577; font-size: 11px; margin: 0; text-align: center;">
          If you did not request this code, please ignore this email.
          <br/>© MMSLLC — Modern Mind Solutions LLC
        </p>
      </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    # ── Send via Gmail SMTP over SSL ───────────────────────────────────────────
    context = ssl.create_default_context()

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, user_email, msg.as_string())
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError(
            "SMTP authentication failed. Check SENDER_EMAIL and SENDER_EMAIL_PASSWORD."
        ) from exc
    except smtplib.SMTPException as exc:
        raise RuntimeError(f"Failed to send OTP email: {exc}") from exc
