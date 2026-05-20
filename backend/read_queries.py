import sqlite3

def main():
    conn = sqlite3.connect('backend/app.db')
    c = conn.cursor()
    
    # Get columns
    c.execute("PRAGMA table_info(bip_report_configs)")
    columns = [col[1] for col in c.fetchall()]
    print("Columns in bip_report_configs:", columns)
    
    print("\n--- bip_report_configs rows ---")
    rows = c.execute("SELECT * FROM bip_report_configs").fetchall()
    for row in rows:
        row_dict = dict(zip(columns, row))
        print(f"ID: {row_dict.get('id')}, Module: {row_dict.get('module')}, Name: {row_dict.get('report_name')}")
        print(f"SQL (first 200 chars):\n{row_dict.get('sql_query')}")
        print("-" * 50)
        
    conn.close()

if __name__ == "__main__":
    main()
