import sqlite3

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    rows = c.execute("SELECT id, user_id, env_name, oracle_username, oracle_url FROM oracle_credentials").fetchall()
    print("Credentials:")
    for row in rows:
        print(" - ID:", row[0], "UserID:", row[1], "Env:", row[2], "Username:", row[3], "URL:", row[4])
    conn.close()

if __name__ == "__main__":
    main()
