/**
 * Database migration to add account_lockout table
 * Run this after the initial schema setup
 */

-- Create account_lockout table
CREATE TABLE IF NOT EXISTS account_lockout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  last_attempt_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_account_lockout_user_id ON account_lockout(user_id);
CREATE INDEX IF NOT EXISTS idx_account_lockout_locked_until ON account_lockout(locked_until);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_account_lockout_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER account_lockout_updated_at BEFORE UPDATE ON account_lockout
  FOR EACH ROW EXECUTE FUNCTION update_account_lockout_updated_at();
