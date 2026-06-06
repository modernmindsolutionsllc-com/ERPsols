-- Final cleanup migration for plaintext credential and SQL columns.
--
-- Run this only after:
-- 1. encrypted_oracle_username / encrypted_oracle_url are fully populated
-- 2. encrypted_sql_query is fully populated
-- 3. the backend cleanup code that depends only on encrypted columns is deployed

ALTER TABLE oracle_credentials
DROP COLUMN IF EXISTS oracle_username,
DROP COLUMN IF EXISTS oracle_url;

ALTER TABLE bip_report_configs
DROP COLUMN IF EXISTS sql_query;
