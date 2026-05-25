import os
import hmac
import hashlib
 
# 1. Bring in your hashing function
def hash_password(password: str) -> str:
    secret = os.getenv("SECRET_KEY", "super-secret-jwt-key-change-in-production")
    return hmac.new(secret.encode(), password.encode(), hashlib.sha256).hexdigest()
 
# 2. List your admins
admins = [
    ("srikant0704", "srikant0704@gmail.com"),
    ("sruidas", "sruidas@modernmindsolutionsllc.com"),
    ("rishavkumar43125", "rishavkumar43125@gmail.com"),
    ("amishra", "amishra@modernmindsolutionsllc.com"),
    ("pmishra", "pmishra@modernmindsolutionsllc.com"),
    ("amishu", "amishu@modernmindsolutionsllc.com"),
]
 
# 3. Generate the SQL script
print("BEGIN;")
print("-- 1. Ensure the 'admin' role exists")
print("INSERT INTO roles (name) VALUES ('admin') ON CONFLICT (name) DO NOTHING;\n")
 
print("-- 2. Bulk Insert / Update all Admins")
print("WITH admin_role AS (")
print("  SELECT id FROM roles WHERE name = 'admin' LIMIT 1")
print(")")
print("INSERT INTO users (username, email, password_hash, role_id, is_active, is_restricted)")
print("VALUES")
 
values = []
for username, email in admins:
    # Generate the custom password (e.g., srikant0704@123)
    raw_password = f"{username}@123"
    hashed_pwd = hash_password(raw_password)
    
    # Format the SQL row (Note: is_active is 1 based on your schema)
    values.append(f"  ('{username}', '{email}', '{hashed_pwd}', (SELECT id FROM admin_role), 1, false)")
 
print(",\n".join(values))
 
print("ON CONFLICT (email) ")
print("DO UPDATE SET ")
print("  role_id = EXCLUDED.role_id,")
print("  is_active = 1,")
print("  is_restricted = false;")
print("COMMIT;")