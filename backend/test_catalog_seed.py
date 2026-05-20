import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from seed_catalog_to_db import parse_catalog_records, build_container_zips, CONTAINERS

def main():
    catalog_path = "backend/QuickConfigTool.catalog"
    print("Parsing catalog...")
    records = parse_catalog_records(catalog_path)
    print(f"Extracted {len(records)} records")

    for rec in records:
        if not rec["meta"] or not rec.get("binary"):
            continue
        path = rec["meta"]["OriginalPath"]
        if "Dynamic SQL Executor DM.xdm" in path and path.endswith(".xdm"):
            print(f"\nFound DM path: {path}")
            # Check length and end
            print(f"Binary length: {len(rec['binary'])}")
            try:
                text = rec['binary'].decode('utf-8')
                print("End of text:")
                print(text[-200:])
            except Exception as e:
                print("Decode error:", e)

if __name__ == "__main__":
    main()
