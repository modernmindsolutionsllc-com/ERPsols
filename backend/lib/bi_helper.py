# bi_helper.py
# lib/bi_helper.py

import requests
from requests import Session as RequestsSession
from requests.auth import HTTPBasicAuth
import sqlite3
import base64
import io
import os
import re
import zipfile
import zlib
import xml.etree.ElementTree as ET
from urllib.parse import urlparse
import textwrap
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.sax.saxutils import escape
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORACLE_VALIDATE_DATA_MODEL_FOLDER = os.getenv(
    "ORACLE_VALIDATE_DATA_MODEL_FOLDER",
    "/My Folders/Validate Catalog/Data Model",
)
LEGACY_CATALOG_ROOTS = (
    "/Custom/iDeploy",
    "/users/mary.david/QuickConfigTool",
    "/users/caleb.gavin/QuickConfigTool",
)


def _resolve_db_path(raw_path: str) -> str:
    if os.path.isabs(raw_path):
        return raw_path
    return os.path.join(BACKEND_DIR, raw_path)


db_path = _resolve_db_path(os.getenv("DB_PATH", "app.db"))

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

def get_bip_CatalogService_urls(url: str) -> list[str]:
    normalized = normalize_url(url)
    return [
        f"{normalized}/xmlpserver/services/CatalogService",
        f"{normalized}/xmlpserver/services/v2/CatalogService",
    ]

# ---------------------------------------------------------------------
# Generic SOAP sender
# ---------------------------------------------------------------------
def send_soap_request(soap_url, soap_body, http_session=None, timeout=None):
    effective_timeout = timeout if timeout is not None else BI_DEFAULT_TIMEOUT
    headers = {
        "Content-Type": "text/xml; charset=UTF-8",
        "Accept": "text/xml, */*",
    }
    try:
        if http_session:
            resp = http_session.post(soap_url, data=soap_body, headers=headers, timeout=effective_timeout)
        else:
            resp = requests.post(soap_url, data=soap_body, headers=headers, timeout=effective_timeout)
        return resp
    except requests.exceptions.RequestException as e:
        return str(e)


def extract_soap_fault(xml_text: str) -> str | None:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    for tag in (
        ".//{http://schemas.xmlsoap.org/soap/envelope/}faultstring",
        ".//faultstring",
    ):
        fault_el = root.find(tag)
        if fault_el is not None and fault_el.text:
            return fault_el.text.strip()

    return None


def describe_soap_failure(resp) -> str:
    if isinstance(resp, str):
        return resp

    status_code = getattr(resp, "status_code", "unknown")
    body = getattr(resp, "text", "") or ""
    fault = extract_soap_fault(body)
    if fault:
        return f"HTTP {status_code}: {fault}"
    if body:
        return f"HTTP {status_code}: {body[:500]}"
    return f"HTTP {status_code}"


def normalize_catalog_payload(b64data: str) -> str:
    """
    Oracle expects objectZippedData to decode directly to a ZIP payload.
    Older local seeds stored zlib-compressed ZIP bytes, so unwrap them here
    to keep existing SQLite rows deployable.
    """
    raw = base64.b64decode(b64data)
    if raw.startswith(b"PK"):
        return b64data

    try:
        unwrapped = zlib.decompress(raw)
    except zlib.error:
        return b64data

    if unwrapped.startswith(b"PK"):
        return base64.b64encode(unwrapped).decode("ascii")
    return b64data


def _validate_catalog_target_paths(oracle_user: str) -> tuple[str, str]:
    target_data_model_folder = _oracle_user_folder_path(oracle_user, ORACLE_VALIDATE_DATA_MODEL_FOLDER)
    target_root_folder = target_data_model_folder.rsplit("/", 1)[0]
    return target_root_folder.rstrip("/"), target_data_model_folder.rstrip("/")


def get_validate_catalog_target_root(oracle_user: str) -> str:
    target_root_folder, _ = _validate_catalog_target_paths(oracle_user)
    return target_root_folder


def get_dynamic_sql_report_path(oracle_user: str) -> str:
    return f"{get_validate_catalog_target_root(oracle_user)}/Dynamic SQL Executor CSV Report.xdo"


def _find_missing_template_aliases(files: dict[str, bytes]) -> dict[str, bytes]:
    report_bytes = files.get("_report.xdo")
    if not report_bytes:
        return {}

    try:
        report_xml = report_bytes.decode("utf-8")
        root = ET.fromstring(report_xml)
    except Exception:
        return {}

    aliases: dict[str, bytes] = {}
    namespace = {"x": "http://xmlns.oracle.com/oxp/xmlp"}
    for template in root.findall(".//x:template", namespace):
        template_url = template.attrib.get("url", "").strip()
        locale = template.attrib.get("locale", "").strip()
        if not template_url or template_url in files:
            continue

        stem, dot, ext = template_url.rpartition(".")
        if not dot:
            continue

        candidate_names = []
        if locale:
            candidate_names.append(f"{stem}_{locale}.{ext}")
            if "_" in locale:
                candidate_names.append(f"{stem}_{locale.split('_', 1)[0]}.{ext}")

        for candidate in candidate_names:
            if candidate in files:
                aliases[template_url] = files[candidate]
                break

    return aliases


def _repair_truncated_xml_file(filename: str, data: bytes) -> tuple[bytes, bool]:
    if not filename.lower().endswith((".xdm", ".xml")):
        return data, False

    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data, False

    try:
        ET.fromstring(text)
        return data, False
    except ET.ParseError:
        pass

    root_match = re.search(r"<([A-Za-z_][\w:.-]*)(?:\s|>)", text)
    if not root_match:
        return data, False

    root_name = root_match.group(1).split(":", 1)[-1]
    expected_close = f"</{root_name}>"
    stripped = text.rstrip()

    if stripped.endswith(expected_close):
        return data, False

    partial_close = re.search(r"</[A-Za-z_][\w:.-]*$", stripped)
    if not partial_close:
        return data, False

    repaired = stripped[: partial_close.start()] + expected_close
    try:
        ET.fromstring(repaired)
    except ET.ParseError:
        return data, False

    trailing = text[len(stripped):]
    return (repaired + trailing).encode("utf-8"), True


def prepare_catalog_payload(
    b64data: str,
    oracle_user: str,
    target_root_folder: str,
    target_data_model_folder: str,
) -> str:
    normalized = normalize_catalog_payload(b64data)
    raw = base64.b64decode(normalized)
    if not raw.startswith(b"PK"):
        return normalized

    changed = False
    output = io.BytesIO()

    try:
        with zipfile.ZipFile(io.BytesIO(raw), "r") as source_zip:
            transformed_files: dict[str, bytes] = {}
            source_infos = list(source_zip.infolist())
            for info in source_infos:
                data = source_zip.read(info.filename)
                if info.filename.lower().endswith((".xdo", ".xdm", ".cfg", ".xml")):
                    try:
                        text = data.decode("utf-8")
                    except UnicodeDecodeError:
                        text = ""

                    if text:
                        next_text = text
                        for legacy_root in LEGACY_CATALOG_ROOTS:
                            next_text = next_text.replace(
                                f"{legacy_root}/Data Models/",
                                f"{target_data_model_folder}/",
                            )
                            next_text = next_text.replace(
                                f"{legacy_root}/Data Model/",
                                f"{target_data_model_folder}/",
                            )
                            next_text = next_text.replace(legacy_root, target_root_folder)
                        if next_text != text:
                            data = next_text.encode("utf-8")
                            changed = True

                transformed_files[info.filename] = data

                repaired_data, repaired = _repair_truncated_xml_file(info.filename, transformed_files[info.filename])
                if repaired:
                    transformed_files[info.filename] = repaired_data
                    changed = True

            template_aliases = _find_missing_template_aliases(transformed_files)
            if template_aliases:
                changed = True
                transformed_files.update(template_aliases)

            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target_zip:
                for info in source_infos:
                    target_zip.writestr(info.filename, transformed_files[info.filename])
                for alias_name, alias_bytes in template_aliases.items():
                    target_zip.writestr(alias_name, alias_bytes)
    except zipfile.BadZipFile:
        return normalized

    if not changed:
        return normalized
    return base64.b64encode(output.getvalue()).decode("ascii")

def fetch_bi_session_token(soap_url, username, password, http_session=None, timeout=None):
    safe_username = escape(username)
    safe_password = escape(password)
    effective_timeout = timeout if timeout is not None else BI_DEFAULT_TIMEOUT
    
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
        resp = http_session.post(soap_url, data=soap_body, headers=headers, timeout=effective_timeout)
    else:
        resp = requests.post(soap_url, data=soap_body, headers=headers, timeout=effective_timeout)

    # Parse SOAP Fault *before* raise_for_status so we can surface the real Oracle error message.
    # Oracle BIP returns HTTP 500 for auth failures; the real reason is inside <faultstring>.
    if not resp.ok:
        fault_msg = None
        body_lower = resp.text.lower()

        if "planned outage" in body_lower:
            raise RuntimeError("Oracle BI environment is currently in a planned outage.")

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
    # Oracle BIP requires the "z" suffix for zipped payloads:
    #   xdo  → xdoz   (zipped report)
    #   xdm  → xdmz   (zipped data model)
    # Sending "xdo" with objectZippedData causes HTTP 500.
    type_map = {
        "xdo": "xdoz",
        "xdm": "xdmz",
    }
    oracle_type = type_map.get(bi_type, bi_type)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://xmlns.oracle.com/oxp/service/PublicReportService">
   <soapenv:Header/>
   <soapenv:Body>
      <pub:uploadReportObjectInSession>
         <pub:reportObjectAbsolutePathURL>{path}</pub:reportObjectAbsolutePathURL>
         <pub:objectType>{oracle_type}</pub:objectType>
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


def _xml_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _oracle_user_folder_path(username: str, relative_path: str) -> str:
    cleaned = (relative_path or "").strip()
    oracle_username = (username or "").strip()
    if cleaned.startswith("/My Folders/"):
        # Oracle's Catalog UI resolves "My Folders" under the /~user path.
        # The /users/User.Name path can exist via SOAP but stay invisible in the UI.
        cleaned = cleaned.replace("/My Folders", f"/~{oracle_username.lower()}", 1)
    if cleaned.startswith(("/users/", "/~")):
        return cleaned.rstrip("/")
    return f"/users/{oracle_username}/{cleaned.strip('/')}".rstrip("/")


def catalog_folder_contents_request(folder_path: str, session_token: str) -> str:
    safe_folder = escape(folder_path)
    safe_token = escape(session_token)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cat="http://xmlns.oracle.com/oxp/service/v2">
   <soapenv:Header/>
   <soapenv:Body>
      <cat:getFolderContentsInSession>
         <cat:folderAbsolutePath>{safe_folder}</cat:folderAbsolutePath>
         <cat:bipSessionToken>{safe_token}</cat:bipSessionToken>
      </cat:getFolderContentsInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""


def catalog_download_object_request(object_path: str, session_token: str) -> str:
    safe_path = escape(object_path)
    safe_token = escape(session_token)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cat="http://xmlns.oracle.com/oxp/service/v2">
   <soapenv:Header/>
   <soapenv:Body>
      <cat:downloadObjectInSession>
         <cat:reportAbsolutePath>{safe_path}</cat:reportAbsolutePath>
         <cat:bipSessionToken>{safe_token}</cat:bipSessionToken>
      </cat:downloadObjectInSession>
   </soapenv:Body>
</soapenv:Envelope>
"""


def _send_catalog_request(url: str, soap_body: str, http_session=None, timeout=None):
    last_resp = None
    for soap_url in get_bip_CatalogService_urls(url):
        resp = send_soap_request(soap_url, soap_body, http_session=http_session, timeout=timeout)
        last_resp = resp
        if not isinstance(resp, str) and getattr(resp, "ok", False):
            return resp
    return last_resp


def _extract_xdm_paths_from_folder_response(xml_text: str, folder_path: str) -> list[str]:
    root = ET.fromstring(xml_text)
    paths: set[str] = set()

    for el in root.iter():
        text = (el.text or "").strip()
        if text.startswith("/users/") and text.lower().endswith(".xdm"):
            paths.add(text)

        children = { _xml_local_name(child.tag).lower(): (child.text or "").strip() for child in list(el) }
        absolute = (
            children.get("absolutepath")
            or children.get("absolute_path")
            or children.get("path")
            or children.get("objectabsolutepath")
            or children.get("catalogpath")
        )
        if absolute and absolute.lower().endswith(".xdm"):
            paths.add(absolute)
            continue

        obj_type = (children.get("type") or children.get("objecttype") or "").lower()
        name = children.get("name") or children.get("displayname") or children.get("title")
        if name and ("xdm" in obj_type or "datamodel" in obj_type or "data model" in obj_type):
            clean_name = name if name.lower().endswith(".xdm") else f"{name}.xdm"
            paths.add(f"{folder_path.rstrip('/')}/{clean_name}")

    return sorted(paths)


def _extract_base64_payload(xml_text: str) -> str:
    root = ET.fromstring(xml_text)
    candidates: list[str] = []
    for el in root.iter():
        text = re.sub(r"\s+", "", (el.text or ""))
        if len(text) < 80:
            continue
        try:
            base64.b64decode(text, validate=True)
        except Exception:
            continue
        candidates.append(text)

    if not candidates:
        raise RuntimeError("Oracle CatalogService response did not include downloadable object data.")
    return max(candidates, key=len)


def _decode_xdm_payload(b64data: str) -> str:
    raw = base64.b64decode(b64data)
    if not raw.startswith(b"PK"):
        try:
            unwrapped = zlib.decompress(raw)
            if unwrapped:
                raw = unwrapped
        except zlib.error:
            pass

    if raw.startswith(b"PK"):
        with zipfile.ZipFile(io.BytesIO(raw), "r") as zf:
            names = zf.namelist()
            preferred = [name for name in names if name.lower().endswith(".xdm")]
            if not preferred:
                preferred = [name for name in names if name.lower().endswith((".xml", ".xdo"))]
            if not preferred:
                raise RuntimeError("Downloaded data model package does not contain XML/XDM content.")
            data = zf.read(preferred[0])
    else:
        data = raw

    for encoding in ("utf-8-sig", "utf-8", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _clean_sql_text(sql_text: str) -> str:
    cleaned = (sql_text or "").strip()
    if cleaned.startswith("<![CDATA["):
        cleaned = cleaned[len("<![CDATA["):]
    if cleaned.endswith("]]>"):
        cleaned = cleaned[:-len("]]>")]
    return cleaned.strip()


def _extract_sql_queries_from_text(xdm_xml: str, data_model_name: str) -> list[dict]:
    found: list[dict] = []
    seen_sql: set[str] = set()
    for index, match in enumerate(re.finditer(r"<sql\b[^>]*>(.*?)</sql>", xdm_xml, flags=re.I | re.S), start=1):
        sql_text = _clean_sql_text(match.group(1))
        if not sql_text or sql_text in seen_sql:
            continue
        seen_sql.add(sql_text)
        dataset_name = data_model_name if index == 1 else f"{data_model_name} Query {index}"
        found.append({"dataset_name": dataset_name, "sql_query": sql_text})
    return found


def _extract_sql_queries_from_xdm(xdm_xml: str, data_model_name: str) -> list[dict]:
    try:
        root = ET.fromstring(xdm_xml)
    except ET.ParseError:
        return _extract_sql_queries_from_text(xdm_xml, data_model_name)

    found: list[dict] = []
    seen_sql: set[str] = set()

    for data_set in root.iter():
        if _xml_local_name(data_set.tag).lower() not in {"dataset", "dataSet".lower()}:
            continue

        ds_name = (
            data_set.attrib.get("name")
            or data_set.attrib.get("dataSetName")
            or data_set.attrib.get("id")
            or data_model_name
        )
        for child in data_set.iter():
            if _xml_local_name(child.tag).lower() != "sql":
                continue
            sql_text = _clean_sql_text(child.text or "")
            if not sql_text or sql_text in seen_sql:
                continue
            seen_sql.add(sql_text)
            found.append({"dataset_name": ds_name, "sql_query": sql_text})

    if found:
        return found

    for child in root.iter():
        if _xml_local_name(child.tag).lower() != "sql":
            continue
        sql_text = _clean_sql_text(child.text or "")
        if not sql_text or sql_text in seen_sql:
            continue
        seen_sql.add(sql_text)
        found.append({"dataset_name": data_model_name, "sql_query": sql_text})

    return found or _extract_sql_queries_from_text(xdm_xml, data_model_name)


def _import_local_catalog_queries(username: str, append_log=None) -> list[dict]:
    def log(message: str) -> None:
        if append_log:
            append_log(message)

    oracle_user = username.strip()
    _, target_data_model_folder = _validate_catalog_target_paths(oracle_user)
    log(f"Falling back to local catalog seed: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT bi_object_abs_path, bi_object_base64_data "
            "FROM bi_catalog_setup_data "
            "WHERE lower(bi_object_type) = 'xdm' "
            "ORDER BY rowid"
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    imported: list[dict] = []
    for original_path, b64data in rows:
        data_model_name = os.path.basename(original_path).removesuffix(".xdm")
        source_path = f"{target_data_model_folder}/{os.path.basename(original_path)}"
        try:
            xdm_xml = _decode_xdm_payload(b64data)
            queries = _extract_sql_queries_from_xdm(xdm_xml, data_model_name)
        except Exception as exc:
            log(f"Skipped local data model {data_model_name}: {type(exc).__name__}: {exc}")
            continue

        log(f"Extracted {len(queries)} SQL query/queryset(s) from local {data_model_name}")
        for query in queries:
            dataset_name = str(query["dataset_name"]).strip() or data_model_name
            report_name = f"{data_model_name} - {dataset_name}"
            imported.append({
                "module": "Validate Catalog",
                "sub_module": data_model_name,
                "report_name": report_name,
                "description": f"Imported from local catalog seed: {source_path}",
                "sql_query": query["sql_query"],
                "source_path": source_path,
                "dataset_name": dataset_name,
            })

    return imported


def import_oracle_catalog_queries(
    username: str,
    password: str,
    url: str,
    source_folder: str | None = None,
    append_log=None,
) -> list[dict]:
    """
    Import SQL datasets from Oracle BI Publisher .xdm data models into the app.
    The router persists the returned rows under the logical "Validate Catalog" module.
    """
    def log(message: str) -> None:
        if append_log:
            append_log(message)

    folder_path = _oracle_user_folder_path(
        username,
        source_folder or ORACLE_VALIDATE_DATA_MODEL_FOLDER,
    )
    session_token = None
    http_session = None

    try:
        log(f"Reading Oracle data models from: {folder_path}")
        session_token, http_session = bi_login(url, username, password)
        log("BI login successful")

        folder_resp = _send_catalog_request(
            url,
            catalog_folder_contents_request(folder_path, session_token),
            http_session=http_session,
            timeout=60,
        )
        if isinstance(folder_resp, str) or not getattr(folder_resp, "ok", False):
            log(f"Unable to list Oracle catalog folder: {describe_soap_failure(folder_resp)}")
            return _import_local_catalog_queries(username, append_log=append_log)

        xdm_paths = _extract_xdm_paths_from_folder_response(folder_resp.text, folder_path)
        log(f"Found {len(xdm_paths)} data model(s)")
        if not xdm_paths:
            return _import_local_catalog_queries(username, append_log=append_log)

        imported: list[dict] = []
        for xdm_path in xdm_paths:
            data_model_name = os.path.basename(xdm_path).removesuffix(".xdm")
            log(f"Downloading data model: {xdm_path}")
            object_resp = _send_catalog_request(
                url,
                catalog_download_object_request(xdm_path, session_token),
                http_session=http_session,
                timeout=120,
            )
            if isinstance(object_resp, str) or not getattr(object_resp, "ok", False):
                log(f"Skipped {xdm_path}: {describe_soap_failure(object_resp)}")
                continue

            try:
                xdm_xml = _decode_xdm_payload(_extract_base64_payload(object_resp.text))
                queries = _extract_sql_queries_from_xdm(xdm_xml, data_model_name)
            except Exception as exc:
                log(f"Skipped {xdm_path}: {type(exc).__name__}: {exc}")
                continue

            log(f"Extracted {len(queries)} SQL query/queryset(s) from {data_model_name}")
            for query in queries:
                dataset_name = str(query["dataset_name"]).strip() or data_model_name
                report_name = f"{data_model_name} - {dataset_name}"
                imported.append({
                    "module": "Validate Catalog",
                    "sub_module": data_model_name,
                    "report_name": report_name,
                    "description": f"Imported from Oracle Catalog: {xdm_path}",
                    "sql_query": query["sql_query"],
                    "source_path": xdm_path,
                    "dataset_name": dataset_name,
                })

        if imported:
            return imported

        log("Oracle catalog download did not yield SQL. Using local catalog seed.")
        return _import_local_catalog_queries(username, append_log=append_log)

    finally:
        if session_token:
            try:
                if bi_logout(url, session_token, http_session=http_session):
                    log("BI logout successful")
            except Exception as exc:
                log(f"BI logout failed: {exc}")

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

        # Preserve Oracle username casing because catalog paths can be case-sensitive.
        oracle_user = username.strip()
        target_root_folder, target_data_model_folder = _validate_catalog_target_paths(oracle_user)
        append_log(f"📁 Target root folder: {target_root_folder}")
        append_log(f"📁 Target data model folder: {target_data_model_folder}")

        # Load catalog objects and rewrite paths for the active user and target folder.
        cursor.execute(
            "SELECT BI_OBJECT_ABS_PATH, BI_OBJECT_TYPE, BI_OBJECT_BASE64_DATA "
            "FROM bi_catalog_setup_data ORDER BY rowid"
        )
        rows_full = cursor.fetchall()
        if not rows_full:
            append_log(f"No catalog setup rows found in SQLite table bi_catalog_setup_data ({db_path}).")
            append_log("Run seed_catalog_to_db.py from the backend folder before deploying the catalog.")
            return False

        dynamic_rows = []
        for original_path, obj_type, b64data in rows_full:
            object_name = original_path.rsplit("/", 1)[-1]
            dynamic_path = (
                f"{target_data_model_folder}/{object_name}"
                if obj_type == "xdm"
                else f"{target_root_folder}/{object_name}"
            )
            dynamic_rows.append((
                dynamic_path,
                obj_type,
                prepare_catalog_payload(
                    b64data,
                    oracle_user,
                    target_root_folder,
                    target_data_model_folder,
                ),
            ))

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
        # 1) Discover ALL required folders from the DB paths
        # ---------------------------------------------------------------
        # Build a complete set of every directory that must exist,
        # including .xdo/.xdm containers which Oracle treats as folders.
        # Example: /users/X/QuickConfigTool/HDL Error Report.xdo/_report.xdo
        #   needs:  /users/X/QuickConfigTool
        #           /users/X/QuickConfigTool/HDL Error Report.xdo
        required_folders: set[str] = set()

        # Always include the top-level base folders
        required_folders.add(target_root_folder)
        required_folders.add(target_data_model_folder)

        # Extract parent directories from every DB object path
        for path, obj_type, b64data in dynamic_rows:
            parent = path.rsplit("/", 1)[0]  # strip filename
            # Walk up the tree and collect every ancestor below /users/{username}
            while parent and parent != target_root_folder and len(parent) > len(target_root_folder):
                required_folders.add(parent)
                parent = parent.rsplit("/", 1)[0]

        # Sort by depth (shallowest first) so parents are created before children
        sorted_folders = sorted(required_folders, key=lambda p: p.count("/"))

        append_log(f"📂 {len(sorted_folders)} directories required")

        # ---------------------------------------------------------------
        # 2) Check which folders already exist
        # ---------------------------------------------------------------
        for folder in sorted_folders:
            append_log(f"⏳ Checking folder: {folder}")

            resp = send_soap_request(soap_url, folder_exists_request(folder, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ SOAP error while checking folder {folder}: {describe_soap_failure(resp)}")
                return False

            exists = parse_boolean_response(resp.text, "isFolderExistInSessionReturn")

            if exists:
                append_log(f"✅ Folder exists: {folder}")
                already_existing_folders.append(folder)
            else:
                append_log(f"❌ Folder missing: {folder}")
                missing_folders.append(folder)

        # ---------------------------------------------------------------
        # 3) Report / Data Model Checks
        # ---------------------------------------------------------------
        for path, obj_type, b64data in dynamic_rows:
            # Skip container entries (no b64 data) — they are folders, not files
            if not b64data:
                continue

            append_log(f"⏳ Checking object: {path}")

            resp = send_soap_request(soap_url, report_exists_request(path, session_token), http_session=http_session)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ SOAP error while checking object {path}: {describe_soap_failure(resp)}")
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
        # 4) Create Missing Folders (shallowest-first, skip duplicates)
        # ---------------------------------------------------------------
        created_set: set[str] = set()  # prevent duplicate creation attempts

        for folder in missing_folders:
            if folder in created_set:
                continue

            append_log(f"📁 Creating folder: {folder}")

            resp = send_soap_request(soap_url, create_folder_request(folder, session_token), http_session=http_session)

            if isinstance(resp, str):
                append_log(f"❌ Connection error creating folder {folder}: {resp}")
                failed_folders.append(folder)
                success = False
            elif not getattr(resp, "ok", True):
                # Oracle returns 500 if folder already exists or is cache-locked
                resp_text = getattr(resp, "text", "")
                lower_resp = resp_text.lower()
                if (
                    "already exists" in lower_resp
                    or "duplicateresourceexception" in lower_resp
                    or "locked" in lower_resp
                ):
                    append_log(f"⚠️ Folder {folder} already exists or is locked — continuing")
                    created_set.add(folder)
                else:
                    append_log(f"❌ Failed to create folder {folder}: {describe_soap_failure(resp)}")
                    failed_folders.append(folder)
                    success = False
            else:
                append_log(f"✅ Folder created: {folder}")
                created_folders.append(folder)
                created_set.add(folder)

        # ---------------------------------------------------------------
        # 5) Upload Reports & Data Models (only files with b64 data)
        # ---------------------------------------------------------------
        upload_rows = sorted(dynamic_rows, key=lambda row: 0 if row[1] == "xdm" else 1)
        for path, obj_type, b64data in upload_rows:
            if path in already_existing_reports:
                continue
            # Skip container entries with no binary payload
            if not b64data:
                continue

            append_log(f"⬆️ Uploading {obj_type}: {path}")

            resp = send_soap_request(soap_url, upload_report_request(path, obj_type, b64data, session_token), http_session=http_session, timeout=120)

            if isinstance(resp, str) or not getattr(resp, "ok", True):
                append_log(f"❌ Upload failed for {path}: {describe_soap_failure(resp)}")
                failed_reports.append(path)
                success = False
            else:
                append_log(f"✅ Uploaded: {path}")
                uploaded_reports.append(path)

        # ---------------------------------------------------------------
        # 6) Summary
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
                logout_ok = bi_logout(url, session_token, http_session=http_session)
                if logout_ok:
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
    print(f"🎯 EXECUTING REPORT: path={report_path}, template={template}")
    print(f"🎯 SQL (first 200 chars): {sql_query[:200]}")

    soap_body = generate_dynamic_sql_soap(sql_query, report_path, template, session_token)

    resp = send_soap_request(soap_url, soap_body, http_session=http_session, timeout=120)

    # --- Handle connection errors (resp is a string) ---
    if isinstance(resp, str):
        print(f"🔥 CONNECTION ERROR: {resp}")
        raise RuntimeError(f"❌ Connection error: {resp}")

    print(f"🔥 RAW ORACLE RESPONSE STATUS: {resp.status_code}")

    # --- Parse the response body regardless of status code ---
    # Oracle returns SOAP faults INSIDE 500 responses. We must parse them.
    resp_text = resp.text
    if not resp.ok:
        print(f"🔥 RAW ORACLE RESPONSE BODY (HTTP {resp.status_code}):\n{resp_text[:1000]}")

    # Try to extract SOAP fault from ANY response (200 or 500)
    try:
        root = ET.fromstring(resp_text)
    except ET.ParseError as e:
        print(f"🔥 XML PARSE ERROR: {e}")
        print(f"🔥 Raw body: {resp_text[:500]}")
        raise RuntimeError(f"Oracle returned unparseable response (HTTP {resp.status_code})")

    ns = {"ns": "http://xmlns.oracle.com/oxp/service/PublicReportService"}

    # Check for SOAP fault
    fault = root.find(".//{http://schemas.xmlsoap.org/soap/envelope/}faultstring")
    if fault is not None and fault.text:
        fault_msg = fault.text.strip()
        print(f"🔥 SOAP FAULT: {fault_msg}")
        raise RuntimeError(f"Oracle SOAP Fault: {fault_msg}")

    # If HTTP was not OK and no fault found, raise generic
    if not resp.ok:
        raise RuntimeError(f"Oracle returned HTTP {resp.status_code} with no SOAP fault")

    # Extract report data
    rb = root.find(".//ns:reportBytes", ns)
    if rb is None or not rb.text:
        print(f"🔥 NO reportBytes IN RESPONSE: {resp_text[:500]}")
        raise ValueError(f"reportBytes not found in Oracle response. Report path: {report_path}")

    decoded = base64.b64decode(rb.text).decode("utf-8-sig")
    print(f"✅ ORACLE RETURNED DATA: {len(decoded)} chars, first 200: {decoded[:200]}")
    return decoded

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
    # 2b. Planned outage / temporary upstream downtime
    # --------------------------------------------------
    if "planned outage" in msg or "503" in msg or "service unavailable" in msg:
        return "The Oracle BI environment is temporarily unavailable (HTTP 503 / planned outage). Please try again once the Oracle pod is back up."

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
