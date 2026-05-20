import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from seed_catalog_to_db import parse_catalog_records
from lib.bi_helper import _repair_truncated_xml_file

def main():
    records = parse_catalog_records("backend/QuickConfigTool.catalog")
    for rec in records:
        if not rec["meta"] or not rec.get("binary"):
            continue
        path = rec["meta"]["OriginalPath"]
        if "Dynamic SQL Executor CSV Report.xdo" in path and path.endswith(".xdo"):
            data = rec["binary"]
            # Let's temporarily run repair with .xdo allowed
            import re
            import xml.etree.ElementTree as ET

            def test_repair(filename, data):
                text = data.decode("utf-8")
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
                    return repaired.encode('utf-8'), True
                except ET.ParseError as e:
                    print("Repair parsed error:", e)
                    return data, False

            repaired_data, repaired = test_repair("_report.xdo", data)
            print("Repaired:", repaired)
            print("Repaired data length:", len(repaired_data))
            print("End of repaired data:")
            print(repaired_data[-100:].decode('utf-8'))

if __name__ == "__main__":
    main()
