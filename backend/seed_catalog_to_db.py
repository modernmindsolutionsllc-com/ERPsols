"""
seed_catalog_to_db.py  (v2 — sealed containers)
─────────────────────────────────────────────────
Reads QuickConfigTool.catalog and extracts the SEALED top-level
.xdo and .xdm containers as base64-encoded zipped blobs — exactly
what Oracle's uploadReportObjectInSession SOAP API expects.

The sub-files (_report.xdo, _datamodel.xdm, xdo.cfg, templates, etc.)
are NOT inserted as separate rows. They are packed INSIDE the zipped
container blobs.

Usage:
    cd backend
    python seed_catalog_to_db.py
"""

import zlib
import json
import struct
import base64
import sqlite3
import zipfile
import io
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_FILE = os.path.join(BACKEND_DIR, "QuickConfigTool.catalog")


def _resolve_db_path(raw_path: str) -> str:
    if os.path.isabs(raw_path):
        return raw_path
    return os.path.join(BACKEND_DIR, raw_path)


DB_PATH = _resolve_db_path(os.getenv("DB_PATH", "app.db"))
TABLE_NAME = "bi_catalog_setup_data"

# Top-level containers Oracle expects (without user prefix).
# The deployment script will prepend /users/{username}/ dynamically.
CONTAINERS = {
    "Dynamic SQL Executor CSV Report.xdo": "xdo",
    "Dynamic SQL Executor XML Report.xdo": "xdo",
    "HDL Error Report.xdo": "xdo",
    "Dynamic SQL Executor DM.xdm": "xdm",
    "HDL Error Report DM.xdm": "xdm",
}


def parse_catalog_records(filepath: str) -> list[dict]:
    """
    Parse the Oracle .catalog binary and return all records
    with their metadata and binary payloads.
    """
    with open(filepath, "rb") as f:
        raw = zlib.decompress(f.read())

    total = len(raw)

    # Skip preamble: 4-byte header + 4 length-prefixed records
    pos = 4
    for _ in range(4):
        length = struct.unpack_from("<I", raw, pos)[0]
        pos += 4 + length

    records = []
    current_meta = None

    while pos + 6 <= total:
        sep = struct.unpack_from("<H", raw, pos)[0]

        if sep == 0x0000:
            length = struct.unpack_from("<I", raw, pos + 2)[0]
            if length > total - pos - 6 or length > 1_000_000:
                break
            payload = raw[pos + 6: pos + 6 + length]
            pos += 2 + 4 + length

            try:
                meta = json.loads(payload.decode("utf-8"))
                if "OriginalPath" in meta:
                    current_meta = meta
                    records.append({"meta": meta, "binary": None})
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        elif sep == 0x0001:
            length = struct.unpack_from("<I", raw, pos + 2)[0]
            if length > total - pos - 6 or length > 5_000_000:
                break
            bin_data = raw[pos + 6 + 4: pos + 6 + length]  # skip 4-byte inner pad
            pos += 2 + 4 + length

            if current_meta and records:
                records[-1]["binary"] = bin_data

        else:
            # Try to recover by finding next JSON block
            scan = raw[pos:pos + 200]
            marker = b'{"Attributes"'
            idx = scan.find(marker)
            if idx >= 0:
                json_start = pos + idx
                if json_start >= 6:
                    pos = json_start - 6
                    continue
            break

    return records


def build_container_zips(records: list[dict]) -> dict[str, bytes]:
    """
    Group the parsed records by their top-level container (.xdo / .xdm)
    and build a ZIP archive for each container — this is the sealed format
    Oracle's SOAP API expects via objectZippedData.
    
    Returns: { container_path: zipped_bytes }
    """
    # Build a tree: container_path -> list of (relative_name, binary_data)
    container_files: dict[str, list[tuple[str, bytes]]] = {}

    for rec in records:
        if not rec["meta"] or not rec.get("binary"):
            continue

        path = rec["meta"]["OriginalPath"]
        name = rec["meta"].get("ItemName", "")

        # Find which container this file belongs to
        for container_name in CONTAINERS:
            # Match paths like: .../ContainerName.xdo/subfile
            container_marker = f"/{container_name}/"
            if container_marker in path:
                # This is a sub-file of this container
                # Extract the container's full path
                idx = path.index(container_marker)
                container_path = path[:idx + len(container_marker) - 1]  # without trailing /
                relative = path[idx + len(container_marker):]  # the sub-file name

                if container_path not in container_files:
                    container_files[container_path] = []
                container_files[container_path].append((relative, rec["binary"]))
                break

    # Build ZIP for each container
    container_zips = {}
    for container_path, files in container_files.items():
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for filename, data in files:
                zf.writestr(filename, data)

        container_zips[container_path] = zip_buffer.getvalue()
        container_name = container_path.rsplit("/", 1)[-1]
        print(f"    [{CONTAINERS.get(container_name, '???'):3s}] {container_path}")
        print(f"          {len(files)} file(s), ZIP={len(zip_buffer.getvalue()):,}B")

    return container_zips


def seed_catalog():
    """Main entry point."""
    if not os.path.exists(CATALOG_FILE):
        print(f"ERROR: '{CATALOG_FILE}' not found in {os.getcwd()}")
        sys.exit(1)

    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database '{DB_PATH}' not found.")
        sys.exit(1)

    print(f"Parsing: {CATALOG_FILE}")
    records = parse_catalog_records(CATALOG_FILE)
    print(f"  Extracted {len(records)} records from catalog")

    print(f"\nBuilding sealed container ZIPs:")
    container_zips = build_container_zips(records)

    if not container_zips:
        print("\nERROR: No container ZIPs could be built.")
        sys.exit(1)

    # ── Insert into SQLite ────────────────────────────────────────────
    print(f"\nSeeding {DB_PATH} -> {TABLE_NAME}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bi_object_abs_path TEXT NOT NULL UNIQUE,
                bi_object_type TEXT NOT NULL,
                bi_object_base64_data TEXT NOT NULL
            )
        """)

        # Nuke any existing data
        cursor.execute(f"DELETE FROM {TABLE_NAME}")
        if cursor.rowcount > 0:
            print(f"  Cleared {cursor.rowcount} existing row(s).")

        # Insert sealed containers
        inserted = 0
        for container_path, zip_bytes in container_zips.items():
            container_name = container_path.rsplit("/", 1)[-1]
            obj_type = CONTAINERS.get(container_name, "xdo")
            b64 = base64.b64encode(zip_bytes).decode("ascii")

            cursor.execute(
                f"INSERT OR REPLACE INTO {TABLE_NAME} "
                f"(bi_object_abs_path, bi_object_type, bi_object_base64_data) "
                f"VALUES (?, ?, ?)",
                (container_path, obj_type, b64),
            )
            inserted += 1

        conn.commit()

        print(f"\n{'=' * 60}")
        print(f"  SUCCESS: {inserted} sealed container(s) inserted")
        print(f"{'=' * 60}")

        # Verify
        cursor.execute(
            f"SELECT bi_object_abs_path, bi_object_type, length(bi_object_base64_data) "
            f"FROM {TABLE_NAME} ORDER BY rowid"
        )
        rows = cursor.fetchall()
        print(f"\n  Verification ({len(rows)} rows):")
        for path, otype, b64len in rows:
            print(f"    [{otype:3s}] {path}  (b64: {b64len:,} chars)")

        # Validate: NO sub-files should be present
        bad = [p for p, _, _ in rows if not p.endswith((".xdo", ".xdm"))]
        if bad:
            print(f"\n  WARNING: Found {len(bad)} non-container path(s)!")
            for b in bad:
                print(f"    BAD: {b}")
        else:
            print(f"\n  VALIDATION PASSED: All {len(rows)} rows are sealed .xdo/.xdm containers.")
            print("  System is ready for Deploy Catalog.")

    except Exception as e:
        print(f"\nERROR: {type(e).__name__}: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()
        print("  Database connection closed.")


if __name__ == "__main__":
    seed_catalog()
