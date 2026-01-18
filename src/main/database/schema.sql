-- ============================================================================
-- e-Archiwum Database Schema
-- AAC (Digital Archive) compliant with Dublin Core + PREMIS
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search optimization

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Users with RBAC
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  email_encrypted TEXT,
  email_hash VARCHAR(128),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'curator', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  lockout_reason VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- ACCOUNT LOCKOUT - Brute-force protection
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_lockout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  failed_attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP,
  lockout_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lockout_user ON account_lockout(user_id);
CREATE INDEX IF NOT EXISTS idx_lockout_locked_until ON account_lockout(locked_until);

-- ============================================================================
-- FILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_hash VARCHAR(64) UNIQUE NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  media_type VARCHAR(50) DEFAULT 'inne',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_version INT DEFAULT 1,
  is_accessible BOOLEAN DEFAULT TRUE,
  access_level VARCHAR(50) DEFAULT 'public' CHECK (access_level IN ('public', 'internal', 'restricted', 'confidential')),
  cover_color VARCHAR(20),
  description TEXT,
  a11y_description TEXT,
  meta_info VARCHAR(255),
  rating FLOAT DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_hash ON files(file_hash);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_files_media_type ON files(media_type);
CREATE INDEX IF NOT EXISTS idx_files_access_level ON files(access_level);

-- Dublin Core metadata (XML storage)
CREATE TABLE IF NOT EXISTS metadata_dublin_core (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  identifier UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  creator VARCHAR(255),
  subject VARCHAR(500),
  description TEXT,
  publisher VARCHAR(255),
  date_created TIMESTAMP,
  date_published TIMESTAMP,
  type VARCHAR(100),
  format VARCHAR(100),
  language VARCHAR(10) DEFAULT 'pl',
  rights TEXT,
  source VARCHAR(500),
  dc_xml TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dc_file ON metadata_dublin_core(file_id);
CREATE INDEX IF NOT EXISTS idx_dc_type ON metadata_dublin_core(type);
CREATE INDEX IF NOT EXISTS idx_dc_language ON metadata_dublin_core(language);

-- PREMIS preservation metadata
CREATE TABLE IF NOT EXISTS metadata_premis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  object_identifier UUID NOT NULL,
  format_name VARCHAR(255),
  format_version VARCHAR(50),
  message_digest_algorithm VARCHAR(50) DEFAULT 'SHA-256',
  message_digest VARCHAR(128),
  message_digest_validation TIMESTAMP,
  preservation_level VARCHAR(50) DEFAULT 'bitPreservation',
  composition_level INT DEFAULT 0,
  original_format VARCHAR(100),
  premis_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_premis_file ON metadata_premis(file_id);
CREATE INDEX IF NOT EXISTS idx_premis_digest ON metadata_premis(message_digest);

-- File versions - complete history
CREATE TABLE IF NOT EXISTS file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  file_size BIGINT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_summary TEXT,
  change_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_file ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_versions_version ON file_versions(version_number);

-- ============================================================================
-- AUDIT & COMPLIANCE
-- ============================================================================

-- Complete audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255),
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================================================
-- COMMENTS & RATINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_moderated BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (file_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_file ON ratings(file_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);

-- ============================================================================
-- SEARCH & INDEXING
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  full_text TEXT,
  ocr_text TEXT,
  extracted_keywords VARCHAR(500)[],
  language VARCHAR(10) DEFAULT 'pl',
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (file_id)
);

-- ============================================================================
-- BACKUP & PRESERVATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date TIMESTAMP NOT NULL,
  files_count INT,
  total_size BIGINT,
  checksum_sha256 VARCHAR(64),
  backup_type VARCHAR(50) NOT NULL,
  retention_until TIMESTAMP,
  storage_location VARCHAR(500),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backup_date ON backup_metadata(backup_date);
CREATE INDEX IF NOT EXISTS idx_backup_retention ON backup_metadata(retention_until);

CREATE TABLE IF NOT EXISTS fixity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  expected_hash VARCHAR(64),
  actual_hash VARCHAR(64),
  check_result VARCHAR(50) NOT NULL,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fixity_file ON fixity_checks(file_id);
CREATE INDEX IF NOT EXISTS idx_fixity_checked ON fixity_checks(checked_at);

-- ============================================================================
-- ACCESS CONTROL
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50),
  can_read BOOLEAN DEFAULT FALSE,
  can_download BOOLEAN DEFAULT FALSE,
  can_modify BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_file ON file_access_rules(file_id);
CREATE INDEX IF NOT EXISTS idx_access_user ON file_access_rules(user_id);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_files_timestamp BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_metadata_dc_timestamp BEFORE UPDATE ON metadata_dublin_core
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_metadata_premis_timestamp BEFORE UPDATE ON metadata_premis
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Auto-log file changes to audit trail
CREATE OR REPLACE FUNCTION log_file_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    action, resource_type, resource_id, previous_value, new_value
  ) VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATE'
         WHEN TG_OP = 'UPDATE' THEN 'UPDATE'
         WHEN TG_OP = 'DELETE' THEN 'DELETE' END,
    'file',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_files_change AFTER INSERT OR UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION log_file_change();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- File with all metadata
CREATE OR REPLACE VIEW v_files_full AS
SELECT
  f.id,
  f.filename,
  f.file_path,
  f.file_hash,
  f.mime_type,
  f.file_size,
  f.media_type,
  f.created_at,
  f.updated_at,
  f.current_version,
  f.access_level,
  dc.title,
  dc.creator,
  dc.type,
  dc.language,
  p.preservation_level,
  p.message_digest_validation,
  COALESCE(AVG(r.rating), 0) as avg_rating,
  COUNT(c.id) as comment_count
FROM files f
LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
LEFT JOIN metadata_premis p ON f.id = p.file_id
LEFT JOIN ratings r ON f.id = r.file_id
LEFT JOIN comments c ON f.id = c.file_id AND c.is_deleted = FALSE
GROUP BY f.id, dc.id, p.id;

-- Active users
CREATE OR REPLACE VIEW v_active_users AS
SELECT id, username, email, role, last_login, created_at
FROM users
WHERE is_active = TRUE;

-- Audit timeline
CREATE OR REPLACE VIEW v_audit_recent AS
SELECT id, user_id, action, resource_type, resource_id, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 1000;

-- ============================================================================
-- INDEXES (Performance optimization)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_files_fts ON files
  USING GIN (to_tsvector('english', COALESCE(filename || ' ' || description, filename)));

CREATE INDEX IF NOT EXISTS idx_comments_recent ON comments (file_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_fts ON search_index USING GIN (to_tsvector('english', full_text));

-- ============================================================================
-- GRANTS (Role-based permissions)
-- ============================================================================

-- These should be set up after user creation
-- Example:
-- GRANT SELECT ON v_files_full TO reader_role;
-- GRANT SELECT, INSERT, UPDATE ON files TO curator_role;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_role;
