# lib/config_generate.py

import io
import pandas as pd
import xlsxwriter
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from fastapi import HTTPException
import csv

from lib.bi_helper import bi_login, bi_logout, get_bip_PublicReportService_url, friendly_bi_error, run_bi_sql_in_session

DEFAULT_COMPARE_THREADS = 10

def safe_sheet_name(name: str, used_names: set) -> str:
    """Ensure a safe sheet name (<=31 chars, no invalid chars, unique)."""
    safe = "".join(ch if ch not in '[]:*?/\\' else '_' for ch in name)[:31]
    candidate = safe
    counter = 2
    while candidate in used_names:
        tail = f" ({counter})"
        candidate = (safe[:max(1, 31 - len(tail))]) + tail
        counter += 1
    used_names.add(candidate)
    return candidate

def csv_to_df(csv_string: str) -> pd.DataFrame:
    """Convert raw CSV string to a pandas DataFrame."""
    try:
        # Wrap the string in StringIO
        return pd.read_csv(io.StringIO(csv_string))
    except Exception as e:
        raise RuntimeError(f"Failed to parse CSV: {e}")

def sanitize_df_for_storage(df: pd.DataFrame) -> pd.DataFrame:
    """Basic cleanup of DataFrame."""
    # Convert all columns to string to avoid serialization issues
    return df.astype(str).replace("nan", "")

def write_br100_workbook_with_index(sheets_dict: dict) -> io.BytesIO:
    """
    Create a BR100-style Excel workbook with an index sheet and one worksheet per SQL result.
    Outputs to an in-memory BytesIO buffer.
    """
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # formats
    header_fmt = workbook.add_format({"bold": True, "border": 1, "align": "center", "valign": "vcenter", "bg_color": "#E6F0FA"})
    cell_fmt = workbook.add_format({"border": 1, "valign": "top"})
    title_fmt = workbook.add_format({"bold": True, "font_size": 14})
    link_fmt = workbook.add_format({'font_color': 'blue', 'underline': True})
    module_hdr_fmt = workbook.add_format({"bold": True, "font_size": 11})
    go_index_fmt = workbook.add_format({'bold': True, 'font_color': 'blue', 'underline': True})

    # build mapping: module -> list of (query_display_name, sheet_name)
    modules = {}
    used_sheet_names = set()

    for key in sheets_dict.keys():
        if ' - ' in key:
            left, qname = key.split(' - ', 1)
            mod = left.strip()
        else:
            mod = "Misc"
            qname = key

        qname = qname.strip()
        raw_sheet = qname[:28]
        sheet_name = safe_sheet_name(raw_sheet, used_sheet_names)
        modules.setdefault(mod, []).append((qname, sheet_name))

    # Index sheet
    index_name = "Index"
    index_ws = workbook.add_worksheet(index_name[:31])

    row = 0
    col = 0
    index_ws.write(row, col, "Configuration Workbook - Index", title_fmt)
    row += 2

    for mod, queries in modules.items():
        index_ws.write(row, col, f"Module: {mod}", module_hdr_fmt)
        row += 1

        seq = 1
        for qname, sheet_name in queries:
            index_ws.write(row, col, seq)
            index_ws.write_url(
                row,
                col + 1,
                f"internal:'{sheet_name}'!A1",
                link_fmt,
                string=qname,
            )
            seq += 1
            row += 1
        row += 1

    index_ws.set_column(0, 0, 10)
    index_ws.set_column(1, 1, 40)

    # Data sheets
    for key, df in sheets_dict.items():
        if ' - ' in key:
            left, qname = key.split(' - ', 1)
            mod = left.strip()
        else:
            mod = "Misc"
            qname = key

        qname = qname.strip()

        pair_list = modules.get(mod, [])
        sheet_name = None
        for candidate_qname, sname in pair_list:
            if candidate_qname == qname:
                sheet_name = sname
                break
        
        ws = workbook.add_worksheet(sheet_name)
        ws.write_url(0, 0, f"internal:'{index_name}'!A1", go_index_fmt, string="Go to Index")
        ws.write(1, 0, qname, title_fmt)

        data_start_row = 3
        try:
            if not isinstance(df, pd.DataFrame):
                df = pd.DataFrame(df)
        except Exception:
            df = pd.DataFrame(df)

        if df is None or df.empty:
            ws.write(data_start_row, 0, "(No data returned)", cell_fmt)
            ws.set_column(0, 0, 30)
            continue

        for cidx, colname in enumerate(df.columns):
            ws.write(data_start_row, cidx, str(colname), header_fmt)

        for r_idx, row_vals in enumerate(df.itertuples(index=False), start=data_start_row + 1):
            for cidx, val in enumerate(row_vals):
                ws.write(r_idx, cidx, str(val), cell_fmt)

        for cidx, colname in enumerate(df.columns):
            try:
                max_len = max(df[colname].astype(str).map(len).max(), len(str(colname)))
                ws.set_column(cidx, cidx, min(max(8, max_len + 2), 60))
            except Exception:
                ws.set_column(cidx, cidx, 20)

    # VERY IMPORTANT: Close workbook, then seek buffer to 0 so it can be read
    workbook.close()
    output.seek(0)
    return output


def _run_single_sql(
    soap_url,
    session_token,
    dyn_report_path,
    dyn_template,
    mod,
    name,
    sqltext,
    sheets,
    errors,
    lock,
    http_session=None
):
    sheet_name = f"{mod} - {name}"

    try:
        csv_data = run_bi_sql_in_session(
            soap_url,
            session_token,
            dyn_report_path,
            dyn_template,
            sqltext,
            http_session=http_session
        )

        df = csv_to_df(csv_data)
        df = sanitize_df_for_storage(df)

        with lock:
            sheets[sheet_name] = df

    except Exception as ex:
        user_msg = friendly_bi_error(ex)
        err = f"{name}: {user_msg}"
        with lock:
            errors.append(err)
            sheets[sheet_name] = pd.DataFrame()


def run_sqls_config_generation(
    username: str,
    password: str,
    url: str,
    sql_items: list[tuple[str, str, str]], # [(module, report_name, sql_query)]
):
    """
    Executes a list of SQL queries against an Oracle BI server, parses the resulting CSVs,
    and constructs a BR100-style Excel workbook in an in-memory BytesIO buffer.
    Returns: (BytesIO_buffer, list_of_errors)
    """
    dyn_report_path = "/users/caleb.gavin/QuickConfigTool/Dynamic SQL Executor CSV Report.xdo"
    dyn_template = "CSV"
    
    session_token = None
    http_session = None
    sheets = {}
    errors = []
    lock = Lock()

    if not sql_items:
        raise HTTPException(status_code=400, detail="No SQLs selected for execution.")

    MAX_THREADS = min(DEFAULT_COMPARE_THREADS, len(sql_items))

    try:
        session_token, http_session = bi_login(url, username, password)
        soap_url = get_bip_PublicReportService_url(url)

        if not session_token:
            raise HTTPException(status_code=400, detail="Unable to login to Oracle BI. Please check credentials.")
    except Exception as e:
        user_msg = friendly_bi_error(e)
        raise HTTPException(status_code=400, detail=f"Oracle BI Login Failed: {user_msg}")

    try:
        with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
            futures = [
                executor.submit(
                    _run_single_sql,
                    soap_url,
                    session_token,
                    dyn_report_path,
                    dyn_template,
                    mod,
                    name,
                    sqltext,
                    sheets,
                    errors,
                    lock,
                    http_session
                )
                for mod, name, sqltext in sql_items
            ]

            for f in as_completed(futures):
                f.result() # Will raise any unexpected thread exceptions
                
    finally:
        if session_token:
            try:
                bi_logout(url, session_token, http_session=http_session)
            except:
                pass

    if not sheets and errors:
        raise HTTPException(status_code=500, detail=f"All reports failed to execute. Errors: {', '.join(errors)}")

    # Generate the in-memory excel file
    excel_buffer = write_br100_workbook_with_index(sheets)
    
    return excel_buffer, errors
