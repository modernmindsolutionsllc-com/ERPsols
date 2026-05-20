import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from lib.bi_helper import _repair_truncated_xml_file

def main():
    # Let's read the binary from the catalog
    from seed_catalog_to_db import parse_catalog_records
    records = parse_catalog_records("backend/QuickConfigTool.catalog")
    for rec in records:
        if not rec["meta"] or not rec.get("binary"):
            continue
        path = rec["meta"]["OriginalPath"]
        if "Dynamic SQL Executor DM.xdm" in path and path.endswith(".xdm"):
            data = rec["binary"]
            repaired_data, repaired = _repair_truncated_xml_file("_datamodel.xdm", data)
            print("Repaired:", repaired)
            print("Repaired data length:", len(repaired_data))
            print("End of repaired data:")
            print(repaired_data[-100:].decode('utf-8'))

if __name__ == "__main__":
    main()
