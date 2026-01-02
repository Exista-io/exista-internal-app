-- Migration Phase 8: Historical Audits + Archive
-- Run this in Supabase SQL Editor

-- Add archived field to audits table for soft delete
ALTER TABLE audits ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for filtering non-archived audits efficiently
CREATE INDEX IF NOT EXISTS idx_audits_archived ON audits(archived);
CREATE INDEX IF NOT EXISTS idx_audits_client_archived ON audits(client_id, archived);

-- Update existing audits to not be archived
UPDATE audits SET archived = FALSE WHERE archived IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN audits.archived IS 'Soft delete flag - archived audits are hidden from UI but preserved in DB';
COMMENT ON COLUMN audits.archived_at IS 'Timestamp when audit was archived';
