import sqlite3
import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Make sure backend path is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__)))
from routers.integrations import decrypt_password

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    row = c.execute("SELECT id, report_name, sql_query, encrypted_sql_query FROM bip_report_configs WHERE id = 5").fetchone()
    print("Row:", row)
    if row:
        sql, enc = row[2], row[3]
        print("sql_query:", repr(sql))
        print("encrypted_sql_query:", repr(enc))
        if enc:
            try:
                dec = decrypt_password(enc)
                print("Decrypted SQL:", repr(dec))
            except Exception as e:
                print("Decryption failed:", e)
    conn.close()

if __name__ == "__main__":
    main()
