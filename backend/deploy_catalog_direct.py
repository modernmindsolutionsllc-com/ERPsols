import sqlite3
import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Make sure backend path is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__)))

from lib.bi_helper import validate_catalog
from routers.integrations import decrypt_password

def append_log(msg: str):
    print(msg)

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    
    # 1. Get credentials
    row_cred = c.execute(
        "SELECT env_name, encrypted_oracle_username, encrypted_oracle_password, encrypted_oracle_url FROM oracle_credentials LIMIT 1"
    ).fetchone()
    if not row_cred:
        print("No credentials found!")
        conn.close()
        return
    env_name, enc_username, enc_pwd, enc_url = row_cred
    username = decrypt_password(enc_username)
    password = decrypt_password(enc_pwd)
    url = decrypt_password(enc_url)
    conn.close()
    
    print(f"Deploying catalog for: {username} on {url}...")
    success = validate_catalog(
        username=username,
        password=password,
        url=url,
        env_name=env_name,
        append_log=append_log
    )
    if success:
        print("\n--- Catalog Deployed & Repaired Successfully! ---")
    else:
        print("\n--- Catalog Deployment Failed! ---")

if __name__ == "__main__":
    main()
