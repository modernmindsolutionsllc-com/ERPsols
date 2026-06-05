import sqlite3
from routers.integrations import decrypt_password

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    rows = c.execute(
        "SELECT id, user_id, env_name, encrypted_oracle_username, encrypted_oracle_url FROM oracle_credentials"
    ).fetchall()
    print("Credentials:")
    for row in rows:
        username = decrypt_password(row[3])
        url = decrypt_password(row[4])
        print(" - ID:", row[0], "UserID:", row[1], "Env:", row[2], "Username:", username, "URL:", url)
    conn.close()

if __name__ == "__main__":
    main()
