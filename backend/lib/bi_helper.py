# bi_helper.py
# lib/bi_helper.py

import requests
from requests import Session as RequestsSession
from requests.auth import HTTPBasicAuth
import sqlite3
import base64
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
import textwrap
from xml.etree.ElementTree import Element, SubElement, tostring
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
# from lib.resources import db_path
db_path = "legacy.db"

BI_DEFAULT_TIMEOUT = 30


def create_authenticated_session(username: str, password: str) -> RequestsSession:
    """Create a requests Session with HTTP Basic Auth for SSO-protected Oracle environments."""
    session = RequestsSession()
    session.auth = HTTPBasicAuth(username, password)
    session.verify = False
    return session

# ---------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------
def normalize_url(url: str) -> str:
    try:
        if not url:
            return ""

        parsed = urlparse(url.strip())

        if not parsed.scheme or not parsed.netloc:
            return ""  

        
        return f"{parsed.scheme}://{parsed.netloc}"

    except Exception:
        return ""

def get_bip_PublicReportService_url(url: str) -> str:
    normalized = normalize_url(url)
    return f"{normalized}/xmlpserver/services/PublicReportService"

def get_bip_ExternalReportWSSService_url(url: str) -> str:
    normalized = normalize_url(url)
    return f"{normalized}/xmlpserver/services/ExternalReportWSSService"

# ---------------------------------------------------------------------
# Generic SOAP sender
# ---------------------------------------------------------------------
def send_soap_request(soap_url, soap_body, http_session=None):
    headers = {
        "Content-Type": "text/xml; charset=UTF-8",
        "Accept": "text/xml, */*",
    }
    try:
        if http_session:
            resp = http_session.post(soap_url, data=soap_body, headers=headers, timeout=BI_DEFAULT_TIMEOUT)
        else:
            resp = requests.post(soap_url, data=soap_body, headers=headers, timeout=BI_DEFAULT_TIMEOUT)
        return resp
    except requests.exceptions.RequestException as e:
        return str(e)

# ---------------------------------------------------------------------
# BI Login / BI Logout
# ---------------------------------------------------------------------
from xml.sax.saxutils import escape

def fetch_bi_session_token(soap_url, username, password, http_session=None):
    safe_username = escape(username)
    safe_password = escape(password)
    
    soap_body = f"""
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
       <soapenv:Header/>
       <soapenv:Body>
          <pub:login>
             <pub:userID>{safe_username}</pub:userID>
             <pub:password>{safe_password}</pub:password>
          </pub:login>
       </soapenv:Body>
    </soapenv:Envelope>
    """

    headers = {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "login"
    }

    if http_session:
        resp = http_session.post(soap_url, data=soap_body, headers=headers, timeout=BI_DEFAULT_TIMEOUT)
    else:
        resp = requests.post(soap_url, data=soap_body, headers=headers, timeout=BI_DEFAULT_TIMEOUT)

    # Parse SOAP Fault *before* raise_for_status so we can surface the real Oracle error message.
    # Oracle BIP returns HTTP 500 for auth failures; the real reason is inside <faultstring>.
    if not resp.ok:
        fault_msg = None
        try:
            root = ET.fromstring(resp.text)
            # Try with explicit namespace URI
            fault_el = root.find(".//{http://schemas.xmlsoap.org/soap/envelope/}faultstring")
            # Fallback: try without namespace (some servers omit it)
            if fault_el is None:
                fault_el = root.find(".//faultstring")
            if fault_el is not None and fault_el.text:
                fault_msg = fault_el.text.strip()
        except Exception:
            pass
        # Fallback: plain-text search in the raw response body
        if not fault_msg and "<faultstring>" in resp.text:
            start = resp.text.index("<faultstring>") + len("<faultstring>")
            end = resp.text.index("</faultstring>", start)
            fault_msg = resp.text[start:end].strip()
        if fault_msg:
            raise RuntimeError(fault_msg)
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    ns = {
        "soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
        "ns": "http://xmlns.oracle.com/oxp/service/PublicReportService",
    }

    token_el = root.find(".//ns:loginReturn", ns)
    if token_el is None or not token_el.text:
        raise RuntimeError("Unable to fetch BI session token. Please verify Oracle credentials.")

    return token_el.text

def bi_login(url, username, password):
    soap_url = get_bip_PublicReportService_url(url)
    http_session = create_authenticated_session(username, password)
    session_token = fetch_bi_session_token(soap_url, username, password, http_session=http_session)
    return session_token, http_session

def bi_logout_request(session_token):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:logout>
         <pub:bipSessionToken>{session_token}</pub:bipSessionToken>
      </pub:logout>
   </soapenv:Body>
</soapenv:Envelope>
"""

def bi_logout(url, session_token, http_session=None):
    if not session_token:
        return False  # logical error: nothing to logout

    soap_url = get_bip_PublicReportService_url(url)
    resp = send_soap_request(soap_url, bi_logout_request(session_token), http_session=http_session)

    if isinstance(resp, str) or not resp.ok:
        return False

    try:
        root = ET.fromstring(resp.text)
        ns = {"ns": "http://xmlns.oracle.com/oxp/service/PublicReportService"}
        result_el = root.find(".//ns:logoutReturn", ns)

        return result_el is not None and result_el.text.lower() == "true"

    except Exception:
        return False

# ---------------------------------------------------------------------
# Catalog-related SOAP builders
# ---------------------------------------------------------------------
def folder_exists_request(folder_path, session_token):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:isFolderExistInSession>
         <pub:folderAbsolutePath>{folder_path}</pub:folderAbsolutePath>
         <pub:bipSessionToken>{session_token}</pub:bipSessionToken>
      </pub:isFolderExistInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""

def create_folder_request(folder_path, session_token):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:createReportFolderInSession>
         <pub:folderAbsolutePath>{folder_path}</pub:folderAbsolutePath>
         <pub:bipSessionToken>{session_token}</pub:bipSessionToken>
      </pub:createReportFolderInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""

def report_exists_request(report_path, session_token):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:isReportExistInSession>
         <pub:reportAbsolutePath>{report_path}</pub:reportAbsolutePath>
         <pub:bipSessionToken>{session_token}</pub:bipSessionToken>
      </pub:isReportExistInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""

def upload_report_request(path, bi_type, bi_data, session_token):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:uploadReportObjectInSession>
         <pub:reportObjectAbsolutePathURL>{path}</pub:reportObjectAbsolutePathURL>
         <pub:objectType>{bi_type}</pub:objectType>
         <pub:objectZippedData>{bi_data}</pub:objectZippedData>
         <pub:bipSessionToken>{session_token}</pub:bipSessionToken>
      </pub:uploadReportObjectInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""

def parse_boolean_response(xml_text, tag_name):
    try:
        root = ET.fromstring(xml_text)
        ns = {"ns": "http://xmlns.oracle.com/oxp/service/PublicReportService"}
        el = root.find(f".//ns:{tag_name}", ns)
        if el is not None and el.text.lower() == "true":
            return True
    except Exception:
        return False

# ---------------------------------------------------------------------
# Catalog validation (FIXED to use new URL helpers)
# ---------------------------------------------------------------------
def validate_catalog(username, password, url, env_name, append_log) -> bool:
    #DB Connection
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    session_token = None
    http_session = None
    success = True

    append_log(f"⚙️ Validating setup for: {username} ({env_name})")

    if not username or not password or not url or not env_name:
        append_log("❌ Missing user/environment details. Validation aborted.")
        return False

    try:
        # ---------------------------------------------------------------
        # Setup
        # ---------------------------------------------------------------
        soap_url = get_bip_PublicReportService_url(url)

        folders_to_check = ["/users/caleb.gavin/QuickConfigTool", "/users/caleb.gavin/QuickConfigTool/Data Models"]

        missing_folders = []
        missing_reports = []

        already_existing_folders = []
        already_existing_reports = []
        created_folders = []
        uploaded_reports = []
        failed_folders = []
        failed_reports = []

        # ---------------------------------------------------------------
        # Login
        # ---------------------------------------------------------------
        try:
            session_token, http_session = bi_login(url, username, password)

            if not session_token:
                raise RuntimeError("❌ Empty BI session token")

            append_log("✅ BI Login Successful")

        except Exception as e:
            append_log(f"❌ BI Login Failed: {str(e)}")
            append_log("   → Unable to validate catalog without BI access.")
            append_log("   → Please delete connection, re-add with correct credentials and retry.")
            return False

        # ---------------------------------------------------------------
        # 1) Folder Checks
        # ---------------------------------------------------------------
        for folder in folders_to_check:
            append_log(f"⏳ Checking folder: {folder}")

            resp = send_soap_request(soap_url, folder_exists_request(folder, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ SOAP error while checking folder {folder}: {resp}")
                return False

            exists = parse_boolean_response(resp.text, "isFolderExistInSessionReturn")

            if exists:
                append_log(f"✅ Folder exists: {folder}")
                already_existing_folders.append(folder)
            else:
                append_log(f"❌ Folder missing: {folder}")
                missing_folders.append(folder)

        # ---------------------------------------------------------------
        # 2) Report / Data Model Checks
        # ---------------------------------------------------------------
        cursor.execute(
            "SELECT BI_OBJECT_ABS_PATH, BI_OBJECT_TYPE, BI_OBJECT_BASE64_DATA "
            "FROM bi_catalog_setup_data ORDER BY rowid"
        )
        rows_full = cursor.fetchall()

        for path, obj_type, b64data in rows_full:
            append_log(f"⏳ Checking object: {path}")

            resp = send_soap_request(soap_url, report_exists_request(path, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ SOAP error while checking object {path}: {resp}")
                return False

            exists = parse_boolean_response(resp.text, "isReportExistInSessionReturn")

            if exists:
                append_log(f"✅ Found: {path}")
                already_existing_reports.append(path)
            else:
                append_log(f"❌ Not found: {path}")
                missing_reports.append(path)

        if not missing_folders and not missing_reports:
            append_log("✅ Everything already present.")
            return True

        # ---------------------------------------------------------------
        # 3) Create Missing Folders
        # ---------------------------------------------------------------
        for folder in missing_folders:
            append_log(f"📁 Creating folder: {folder}")

            resp = send_soap_request(soap_url, create_folder_request(folder, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ Failed to create folder {folder}: {resp}")
                failed_folders.append(folder)
                success = False
            else:
                append_log(f"✅ Folder created: {folder}")
                created_folders.append(folder)

        # ---------------------------------------------------------------
        # 4) Upload Reports & Data Models
        # ---------------------------------------------------------------
        for path, obj_type, b64data in rows_full:
            if path in already_existing_reports:
                continue

            append_log(f"⬆️ Uploading {obj_type}: {path}")

            resp = send_soap_request(soap_url, upload_report_request(path, obj_type, b64data, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ Upload failed for {path}: {resp}")
                failed_reports.append(path)
                success = False
            else:
                append_log(f"✅ Uploaded: {path}")
                uploaded_reports.append(path)

        # ---------------------------------------------------------------
        # 5) Summary
        # ---------------------------------------------------------------
        append_log("\n===== Summary =====")

        if already_existing_folders:
            append_log("\n✅ Existing folders:\n" + "\n".join(already_existing_folders))
        if created_folders:
            append_log("\n✅ Created folders:\n" + "\n".join(created_folders))
        if failed_folders:
            append_log("\n❌ Failed folders:\n" + "\n".join(failed_folders))

        if already_existing_reports:
            append_log("\n✅ Existing reports:\n" + "\n".join(already_existing_reports))
        if uploaded_reports:
            append_log("\n✅ Uploaded reports:\n" + "\n".join(uploaded_reports))
        if failed_reports:
            append_log("\n❌ Failed reports:\n" + "\n".join(failed_reports))

        if failed_folders or failed_reports:
            append_log("⚠ Some items could not be restored. Admin privileges may be required.")
            success = False
        else:
            append_log("🎉 Catalog validated and restored successfully.")

    except Exception as e:
        append_log(f"🔥 Unexpected error occurred: {type(e).__name__}: {str(e)}")
        success = False

    finally:
        # ---------------------------------------------------------------
        # Close DB connection
        # ---------------------------------------------------------------
        try:
            conn.close()
        except Exception:
            pass

        # ---------------------------------------------------------------
        # BI Logout
        # ---------------------------------------------------------------
        if session_token:
            try:
                success = bi_logout(url, session_token, http_session=http_session)
                if success:
                    append_log("✅ BI Logout Successful")
                else:
                    append_log("❌ BI Logout failed")
            except Exception as e:
                append_log(f"❌ Exception during BI logout: {e}")

    return success

def generate_dynamic_sql_soap(sql_query, report_path, template, session_token):
    # Encode SQL and split into 4000-char chunks
    b64_query = base64.b64encode(sql_query.encode("utf-8")).decode("utf-8")
    chunks = textwrap.wrap(b64_query, 4000)

    # Namespaces
    ns_soap = "http://schemas.xmlsoap.org/soap/envelope/"
    ns_pub = "http://xmlns.oracle.com/oxp/service/PublicReportService"

    # SOAP Envelope
    envelope = Element(f"{{{ns_soap}}}Envelope")
    envelope.set("xmlns:soapenv", ns_soap)
    envelope.set("xmlns:pub", ns_pub)

    # Header & Body
    SubElement(envelope, f"{{{ns_soap}}}Header")
    body = SubElement(envelope, f"{{{ns_soap}}}Body")

    # runReportInSession
    run_report = SubElement(body, f"{{{ns_pub}}}runReportInSession")
    report_request = SubElement(run_report, f"{{{ns_pub}}}reportRequest")

    # Report attributes
    SubElement(report_request, f"{{{ns_pub}}}attributeFormat").text = "csv"
    SubElement(report_request, f"{{{ns_pub}}}attributeTemplate").text = template

    # Parameters (dynamic SQL chunks)
    param_name_values = SubElement(
        report_request, f"{{{ns_pub}}}parameterNameValues"
    )

    for i, chunk in enumerate(chunks, start=1):
        item = SubElement(param_name_values, f"{{{ns_pub}}}item")
        SubElement(item, f"{{{ns_pub}}}name").text = f"query{i}"
        values = SubElement(item, f"{{{ns_pub}}}values")
        SubElement(values, f"{{{ns_pub}}}item").text = chunk

    # Report path and chunk size
    SubElement(
        report_request, f"{{{ns_pub}}}reportAbsolutePath"
    ).text = report_path
    SubElement(
        report_request, f"{{{ns_pub}}}sizeOfDataChunkDownload"
    ).text = "-1"

    # Session token
    SubElement(
        run_report, f"{{{ns_pub}}}bipSessionToken"
    ).text = session_token

    return tostring(envelope, encoding="utf-8")

# ---------------------------------------------------------------------
# Run BI SQL in session (used by sync_master)
# ---------------------------------------------------------------------
def run_bi_sql_in_session(soap_url, session_token, report_path, template, sql_query, http_session=None):
    soap_body = generate_dynamic_sql_soap(sql_query, report_path, template, session_token)

    resp = send_soap_request(soap_url, soap_body, http_session=http_session)
    if isinstance(resp, str) or not resp.ok:
        raise RuntimeError(f"❌ SOAP error: {resp}")

    root = ET.fromstring(resp.text)
    ns = {"ns": "http://xmlns.oracle.com/oxp/service/PublicReportService"}

    rb = root.find(".//ns:reportBytes", ns)
    if rb is None:
        raise ValueError("reportBytes not found")

    return base64.b64decode(rb.text).decode("utf-8-sig")

#Convert low-level BI / SOAP / HTTP errors into user-friendly messages.
def friendly_bi_error(err: Exception | str) -> str:
    """
    Convert low-level BI / SOAP / HTTP / requests errors
    into clear, user-friendly messages.
    """
    msg = str(err).lower()
    original = str(err)

    # --------------------------------------------------
    # 1. Timeouts (MOST IMPORTANT — must be first)
    # --------------------------------------------------
    if (
        "read timed out" in msg
        or "timeout" in msg
        or "timed out" in msg
    ):
        return "Query timed out. The Oracle BI server took too long to respond."

    # --------------------------------------------------
    # 2. Network / connectivity issues
    # --------------------------------------------------
    if (
        "connectionpool" in msg
        or "max retries exceeded" in msg
        or "failed to establish a new connection" in msg
        or "connection refused" in msg
        or "name or service not known" in msg
    ):
        return "Cannot connect to Oracle BI server. Please check the server URL in your Oracle credentials."

    # --------------------------------------------------
    # 3. Account locked (Oracle locks after repeated failed logins)
    # --------------------------------------------------
    if "locked" in msg or "account is locked" in msg or "user is locked" in msg:
        return (
            "Your Oracle account has been locked due to too many failed login attempts. "
            "Please contact your Oracle administrator to unlock the account "
            "(Caleb.Gavin on fa-etaj-saasfademo1.ds-fa.oraclepdemos.com), "
            "then reconnect with the correct credentials."
        )

    # --------------------------------------------------
    # 4. Invalid credentials (Oracle SOAP fault message)
    # --------------------------------------------------
    if "invalid username or password" in msg or "failed to log into bi publisher" in msg:
        return f"Invalid Oracle username or password: {original}"

    # --------------------------------------------------
    # 4. Authentication / authorization
    # --------------------------------------------------
    if "401" in msg or "unauthorized" in msg:
        return "Oracle authentication failed. Please check your credentials."

    if "403" in msg or "accessdenied" in msg:
        return "Access denied by Oracle. Your account may not have BIP access."

    # --------------------------------------------------
    # 5. BI Publisher internal/server errors
    # --------------------------------------------------
    if (
        "500" in msg
        or "internal server error" in msg
        or "<response [500]>" in msg
    ):
        return "Oracle BI server returned an internal error (500). Please try again later."

    # --------------------------------------------------
    # 6. SOAP-level faults
    # --------------------------------------------------
    if "soap fault" in msg or "faultcode" in msg:
        return "Oracle BI returned an invalid API response. Please contact your administrator."

    # --------------------------------------------------
    # 7. Fallback
    # --------------------------------------------------
    return f"An unexpected Oracle BI error occurred: {original}"
