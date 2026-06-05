-- Supabase/PostgreSQL migration for Oracle credential field encryption.
--
-- Run this first in Supabase SQL Editor before deploying the backend
-- change or running the Python backfill script.
--
-- This migration is intentionally non-destructive:
-- 1. keeps the legacy plaintext columns in place
-- 2. adds the new encrypted columns
-- 3. leaves backfill to the backend app, which already has the Fernet key

ALTER TABLE oracle_credentials
ADD COLUMN IF NOT EXISTS encrypted_oracle_username TEXT;

ALTER TABLE oracle_credentials
ADD COLUMN IF NOT EXISTS encrypted_oracle_url TEXT;

-- Optional validation query after the Python backfill runs:
-- SELECT
--   COUNT(*) AS total_rows,
--   COUNT(encrypted_oracle_username) AS encrypted_username_rows,
--   COUNT(encrypted_oracle_url) AS encrypted_url_rows,
--   COUNT(oracle_username) AS legacy_username_rows,
--   COUNT(oracle_url) AS legacy_url_rows
-- FROM oracle_credentials;

-- Do not drop the legacy plaintext columns yet with the current backend.
-- The compatibility rollout keeps them populated until a later cleanup
-- migration and code removal step.
