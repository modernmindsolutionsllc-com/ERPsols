import sqlite3
import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Make sure backend path is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__)))

from lib.bi_helper import bi_login, run_bi_sql_in_session, get_dynamic_sql_report_path, get_bip_PublicReportService_url
from routers.integrations import decrypt_password

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    
    # 1. Get credentials
    row_cred = c.execute(
        "SELECT encrypted_oracle_username, encrypted_oracle_password, encrypted_oracle_url FROM oracle_credentials LIMIT 1"
    ).fetchone()
    if not row_cred:
        print("No credentials found!")
        return
    enc_username, enc_pwd, enc_url = row_cred
    username = decrypt_password(enc_username)
    password = decrypt_password(enc_pwd)
    url = decrypt_password(enc_url)
    
    # 2. Get query for Test_Person_Numbers_Recent
    row_q = c.execute("SELECT report_name, encrypted_sql_query FROM bip_report_configs WHERE id = 5").fetchone()
    sql = decrypt_password(row_q[1])
    
    conn.close()
    
    print("Environment details:")
    print(" - Username:", username)
    print(" - URL:", url)
    print(" - SQL query:", sql)
    
    # 3. Login
    print("\nLogging into BI...")
    session_token, http_session = bi_login(url, username, password)
    print("Session token:", session_token)
    
    soap_url = get_bip_PublicReportService_url(url)
    dyn_report_path = get_dynamic_sql_report_path(username)
    dyn_template = "blank_en_US"
    
    print("\nRunning report...")
    print("Report path:", dyn_report_path)
    try:
        csv_data = run_bi_sql_in_session(
            soap_url,
            session_token,
            dyn_report_path,
            dyn_template,
            sql,
            http_session=http_session
        )
        print("\n--- Success! CSV Data received ---")
        print(repr(csv_data))
    except Exception as e:
        print("\n--- Error during execution ---")
        print(e)

if __name__ == "__main__":
    main()
