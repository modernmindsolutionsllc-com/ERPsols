import sqlite3
import os
import sys

# Ensure backend directory is in the import path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from Auth_utils import hash_password
except ImportError:
    # Fallback to dummy hash if imported outside FastAPI environment
    import hashlib
    import hmac
    def hash_password(password: str) -> str:
        secret = os.getenv("SECRET_KEY", "super-secret-jwt-key-change-in-production")
        return hmac.new(secret.encode(), password.encode(), hashlib.sha256).hexdigest()

def make_admins():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.db")
    print(f"Connecting to database at: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Fetch or insert the 'admin' role ID
    cursor.execute("SELECT id FROM roles WHERE name = ?", ("admin",))
    role_row = cursor.fetchone()
    if not role_row:
        print("Role 'admin' not found. Seeding role 'admin'...")
        cursor.execute("INSERT OR IGNORE INTO roles (name) VALUES (?)", ("admin",))
        conn.commit()
        cursor.execute("SELECT id FROM roles WHERE name = ?", ("admin",))
        role_row = cursor.fetchone()

    admin_role_id = role_row["id"]
    print(f"Admin role ID: {admin_role_id}")

    # 2. Setup the target emails
    emails = [
        "srikant0704@gmail.com",
        "sruidas@modernmindsolutionsllc.com",
        "rishavkumar43125@gmail.com",
        "amishra@modernmindsolutionsllc.com",
        "pmishra@modernmindsolutionsllc.com", 
        "amishu@modernmindsolutionsllc.com"
    ]

    for email in emails:
        email_clean = email.strip().lower()
        username = email_clean.split("@")[0]

        # Attempt to update first
        cursor.execute(
            "UPDATE users SET role_id = ?, is_active = 1 WHERE lower(email) = ?",
            (admin_role_id, email_clean)
        )
        updated = cursor.rowcount

        if updated > 0:
            print(f"Successfully UPDATED existing user '{email_clean}' to role admin.")
        else:
            # Fallback to inserting the user as admin
            default_pwd = "AdminSecurePassword123!"
            pwd_hash = hash_password(default_pwd)
            try:
                cursor.execute(
                    "INSERT INTO users (username, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, 1)",
                    (username, email_clean, pwd_hash, admin_role_id)
                )
                print(f"Successfully INSERTED new user '{email_clean}' as admin (Default Password: '{default_pwd}').")
            except sqlite3.IntegrityError as e:
                # Username or email collision
                print(f"Failed to insert user '{email_clean}': {e}. Retrying update...")
                cursor.execute(
                    "UPDATE users SET role_id = ?, is_active = 1 WHERE lower(username) = ? OR lower(email) = ?",
                    (admin_role_id, username, email_clean)
                )

    conn.commit()
    conn.close()
    print("Database admin bootstrap completed successfully.")

if __name__ == "__main__":
    make_admins()
