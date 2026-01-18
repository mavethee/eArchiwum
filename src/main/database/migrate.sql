-- Migration Script: From JSON Database to PostgreSQL
-- This script helps migrate data from the old ear-database.json to the new PostgreSQL schema

-- IMPORTANT: Run this AFTER schema.sql has been imported!

-- ============================================================================
-- MIGRATION STEPS
-- ============================================================================

-- Step 1: Create temporary JSON import table (if migrating from JSON)
-- Skip this if no old data exists

CREATE TEMPORARY TABLE old_data (
  comments JSONB,
  ratings JSONB,
  users JSONB,
  current_user JSONB
);

-- Note: To import JSON from file:
-- psql -U postgres -d e_archiwum_dev -c "
--   COPY old_data(comments) FROM '/path/to/ear-database.json'
-- "

-- ============================================================================
-- Step 2: Seed default users if migrating from old system
-- ============================================================================

INSERT INTO users (username, email, email_hash, password_hash, role, is_active)
VALUES (
  'demo',
  'demo@e-archiwum.local',
  encode(digest('demo@e-archiwum.local', 'sha256'), 'hex'),
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36jbMv1K',  -- bcrypt of 'demo'
  'reader',
  TRUE
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, email_hash, password_hash, role, is_active)
VALUES (
  'curator',
  'curator@e-archiwum.local',
  encode(digest('curator@e-archiwum.local', 'sha256'), 'hex'),
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36jbMv1K',
  'curator',
  TRUE
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, email, email_hash, password_hash, role, is_active)
VALUES (
  'admin',
  'admin@e-archiwum.local',
  encode(digest('admin@e-archiwum.local', 'sha256'), 'hex'),
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86E36jbMv1K',
  'admin',
  TRUE
)
ON CONFLICT (username) DO NOTHING;

-- Backfill email_hash for existing records (idempotent)
UPDATE users
SET email_hash = encode(digest(email, 'sha256'), 'hex')
WHERE email IS NOT NULL AND email_hash IS NULL;

-- ============================================================================
-- Step 3: Create sample archive entries
-- ============================================================================

INSERT INTO files (
  filename, file_path, file_hash, mime_type, file_size,
  media_type, created_by, access_level, description, a11y_description, meta_info
) VALUES (
  'Demo Document',
  '/archive/demo.pdf',
  'demo_hash_001',
  'application/pdf',
  1024000,
  'teksty',
  (SELECT id FROM users WHERE username = 'admin' LIMIT 1),
  'public',
  'Demo archival document',
  'Zeskanowany dokument archiwum',
  'Demo'
)
ON CONFLICT (file_hash) DO NOTHING;

-- ============================================================================
-- Step 4: Create metadata for sample entry
-- ============================================================================

INSERT INTO metadata_dublin_core (
  file_id, identifier, title, creator, type, format, language, dc_xml
) SELECT
  f.id,
  f.id,
  f.filename,
  'Archive System',
  'document',
  f.mime_type,
  'pl',
  '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description><dc:title>' || f.filename || '</dc:title></rdf:Description></rdf:RDF>'
FROM files f
LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
WHERE dc.id IS NULL;

-- ============================================================================
-- Step 5: Create PREMIS metadata for all files
-- ============================================================================

INSERT INTO metadata_premis (
  file_id, object_identifier, format_name, message_digest,
  message_digest_algorithm, preservation_level, premis_json
) SELECT
  f.id,
  f.id,
  f.mime_type,
  f.file_hash,
  'SHA-256',
  'fullPreservation',
  jsonb_build_object(
    'premis:objectIdentifier', f.id,
    'premis:preservationLevel', 'fullPreservation',
    'premis:events', jsonb_build_array(
      jsonb_build_object(
        'premis:eventType', 'creation',
        'premis:eventDateTime', NOW()::text
      )
    )
  )
FROM files f
LEFT JOIN metadata_premis p ON f.id = p.file_id
WHERE p.id IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify users
SELECT COUNT(*) as user_count FROM users WHERE is_active = TRUE;

-- Verify files
SELECT COUNT(*) as file_count FROM files;

-- Verify metadata
SELECT 
  COUNT(dc.id) as dublin_core_count,
  COUNT(p.id) as premis_count
FROM files f
LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
LEFT JOIN metadata_premis p ON f.id = p.file_id;

-- Show audit log
SELECT action, resource_type, COUNT(*) as count
FROM audit_log
GROUP BY action, resource_type;

-- ============================================================================
-- POST-MIGRATION TASKS
-- ============================================================================

-- 1. Index optimization
ANALYZE;
VACUUM;

-- 2. Verify full-text search index
SELECT * FROM pg_indexes WHERE tablename = 'files';

-- 3. Test search functionality
SELECT filename, to_tsvector('polish', filename) 
FROM files 
WHERE to_tsvector('polish', filename) @@ plainto_tsquery('polish', 'demo');

-- ============================================================================
-- CLEANUP (Run after verifying migration)
-- ============================================================================

-- Drop temporary table if it was created
-- DROP TABLE IF EXISTS old_data;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
Migration Checklist:
[ ] PostgreSQL server running
[ ] Database e_archiwum_dev created
[ ] schema.sql imported successfully
[ ] Default users created (demo, curator, admin)
[ ] Sample archive entry created
[ ] Metadata populated
[ ] Full-text search working
[ ] Audit log populated
[ ] Verification queries passed

Default credentials for testing:
- demo / demo
- curator / demo  
- admin / demo

Change all passwords in production!
*/
