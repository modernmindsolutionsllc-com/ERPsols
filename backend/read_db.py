import sqlite3
import base64
import zlib
import zipfile
import io

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    b64 = c.execute('SELECT BI_OBJECT_BASE64_DATA FROM bi_catalog_setup_data WHERE BI_OBJECT_ABS_PATH LIKE "%Dynamic SQL Executor DM.xdm%"').fetchone()[0]
    conn.close()

    raw = base64.b64decode(b64)
    if raw.startswith(b"PK"):
        zip_data = raw
    else:
        zip_data = zlib.decompress(raw)

    with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
        if "_datamodel.xdm" in z.namelist():
            print("\n--- _datamodel.xdm contents ---")
            print(z.read("_datamodel.xdm").decode("utf-8"))

if __name__ == "__main__":
    main()
