import sqlite3
import os
import sys
from dotenv import load_dotenv
load_dotenv()

sys.path.append(os.path.join(os.path.dirname(__file__)))

from lib.bi_helper import bi_login, send_soap_request, get_bip_PublicReportService_url, folder_exists_request, report_exists_request
from routers.integrations import decrypt_password

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    row_cred = c.execute("SELECT oracle_username, encrypted_oracle_password, oracle_url FROM oracle_credentials LIMIT 1").fetchone()
    if not row_cred:
        print("No credentials found!")
        return
    username, enc_pwd, url = row_cred
    password = decrypt_password(enc_pwd)
    conn.close()

    print("Logging into BI...")
    session_token, http_session = bi_login(url, username, password)
    soap_url = get_bip_PublicReportService_url(url)
    
    paths_to_test = [
        # /users/Mary.David
        f"/users/{username}/QuickConfigTool",
        f"/users/{username}/QuickConfigTool/Dynamic SQL Executor CSV Report.xdo",
        f"/users/{username}/QuickConfigTool/Dynamic SQL Executor DM.xdm",
        
        # /~Mary.David
        f"/~{username}/QuickConfigTool",
        f"/~{username}/QuickConfigTool/Dynamic SQL Executor CSV Report.xdo",
        f"/~{username}/QuickConfigTool/Dynamic SQL Executor DM.xdm",

        # /users/mary.david
        f"/users/{username.lower()}/QuickConfigTool",
        f"/users/{username.lower()}/QuickConfigTool/Dynamic SQL Executor CSV Report.xdo",
        f"/users/{username.lower()}/QuickConfigTool/Dynamic SQL Executor DM.xdm",

        # /~mary.david
        f"/~{username.lower()}/QuickConfigTool",
        f"/~{username.lower()}/QuickConfigTool/Dynamic SQL Executor CSV Report.xdo",
        f"/~{username.lower()}/QuickConfigTool/Dynamic SQL Executor DM.xdm",
    ]

    print("\nTesting paths existence:")
    for path in paths_to_test:
        if path.endswith((".xdo", ".xdm")):
            req = report_exists_request(path, session_token)
            tag = "isReportExistInSessionReturn"
            kind = "Object"
        else:
            req = folder_exists_request(path, session_token)
            tag = "isFolderExistInSessionReturn"
            kind = "Folder"

        resp = send_soap_request(soap_url, req, http_session=http_session)
        if isinstance(resp, str) or not resp.ok:
            print(f"Error checking {path}: {resp}")
            continue
            
        from xml.etree import ElementTree as ET
        root = ET.fromstring(resp.text)
        ns = {"ns": "http://xmlns.oracle.com/oxp/service/PublicReportService"}
        el = root.find(f".//ns:{tag}", ns)
        exists = el is not None and el.text.lower() == "true"
        print(f"[{kind:6s}] Exists: {str(exists):5s} | Path: {path}")

if __name__ == "__main__":
    main()
