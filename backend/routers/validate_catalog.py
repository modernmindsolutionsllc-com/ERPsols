def validate_catalog(username, password, url, env_name, append_log) -> bool:
    #DB Connection
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    session_token = None
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

        # Oracle's internal user folders are case-sensitive (e.g. Mary.David)
        oracle_user = username.strip()

        user_base_path = f"/~{oracle_user}/QuickConfigTool"
        folders_to_check = [user_base_path]

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
            session_token = bi_login(url, username, password)

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

            resp = send_soap_request(soap_url, folder_exists_request(folder, session_token)            )

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
        rows_raw = cursor.fetchall()

        # Rewrite DB paths to the active user's directory (case-sensitive)
        rows_full = []
        for original_path, obj_type, b64data in rows_raw:
            dynamic_path = original_path.replace("/users/Mary.David", f"/users/{oracle_user}")
            dynamic_path = dynamic_path.replace("/users/Caleb.Gavin", f"/users/{oracle_user}")
            rows_full.append((dynamic_path, obj_type, b64data))

        for path, obj_type, b64data in rows_full:
            append_log(f"⏳ Checking object: {path}")

            resp = send_soap_request(soap_url, report_exists_request(path, session_token))

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

            resp = send_soap_request(soap_url, create_folder_request(folder, session_token))

            if isinstance(resp, str):
                append_log(f"❌ Connection error creating folder {folder}: {resp}")
                failed_folders.append(folder)
                success = False
            elif not getattr(resp, "ok", True):
                resp_text = getattr(resp, "text", "")
                if "already exists" in resp_text.lower() or "locked" in resp_text.lower():
                    append_log(f"⚠️ Folder {folder} already exists or is locked — continuing")
                else:
                    append_log(f"❌ Failed to create folder {folder}: HTTP {resp.status_code}")
                    append_log(f"   Response: {resp_text[:300]}")
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

            resp = send_soap_request(soap_url, upload_report_request(path, obj_type, b64data, session_token), timeout=120)

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
                success = bi_logout(url, session_token)
                if success:
                    append_log("✅ BI Logout Successful")
                else:
                    append_log("❌ BI Logout failed")
            except Exception as e:
                append_log(f"❌ Exception during BI logout: {e}")

    return success