/**
 * Migration: add encrypted email fields
 * - Adds email_encrypted (AES-256-GCM payload stored as hex) and email_hash for fast lookups
 * - Backfills email_hash using SHA-256 of existing email (to preserve uniqueness checks)
 */

-- Add columns if missing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS email_hash VARCHAR(128);

-- Backfill hashes for existing records
UPDATE users
SET email_hash = encode(digest(email, 'sha256'), 'hex')
WHERE email IS NOT NULL AND email_hash IS NULL;

-- Index for fast lookups and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
