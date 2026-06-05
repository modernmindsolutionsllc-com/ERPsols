import os
from typing import Iterable

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import SessionLocal, OracleCredential
from routers.integrations import encrypt_password


load_dotenv()


def iter_plaintext_credentials(db: Session) -> Iterable[OracleCredential]:
    return (
        db.query(OracleCredential)
        .filter(
            OracleCredential.legacy_oracle_username.is_not(None),
            OracleCredential.legacy_oracle_url.is_not(None),
        )
        .all()
    )


def backfill_oracle_credentials() -> tuple[int, int]:
    db = SessionLocal()
    updated = 0
    skipped = 0

    try:
        credentials = iter_plaintext_credentials(db)
        for credential in credentials:
            username = (credential.legacy_oracle_username or "").strip()
            oracle_url = (credential.legacy_oracle_url or "").strip()

            if not username or not oracle_url:
                skipped += 1
                continue

            credential.encrypted_oracle_username = encrypt_password(username)
            credential.encrypted_oracle_url = encrypt_password(oracle_url)
            updated += 1

        db.commit()
        return updated, skipped
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    updated, skipped = backfill_oracle_credentials()
    print(f"Backfill complete. Updated: {updated}, Skipped: {skipped}")
