from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import SessionLocal, BipReportConfig
from routers.integrations import encrypt_password


load_dotenv()


def iter_plaintext_bip_reports(db: Session) -> list[BipReportConfig]:
    return (
        db.query(BipReportConfig)
        .filter(BipReportConfig.sql_query.is_not(None))
        .all()
    )


def backfill_bip_sql_queries() -> tuple[int, int]:
    db = SessionLocal()
    updated = 0
    skipped = 0

    try:
        reports = iter_plaintext_bip_reports(db)
        for report in reports:
            sql_query = (report.sql_query or "").strip()
            if not sql_query:
                skipped += 1
                continue

            report.encrypted_sql_query = encrypt_password(sql_query)
            updated += 1

        db.commit()
        return updated, skipped
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    updated, skipped = backfill_bip_sql_queries()
    print(f"BIP SQL backfill complete. Updated: {updated}, Skipped: {skipped}")
