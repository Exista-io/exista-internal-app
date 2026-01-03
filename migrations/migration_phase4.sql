-- EVS v2.0 Migration: Add raw_response storage for Multi-Engine Audits
-- Run this in Supabase SQL Editor

-- 1. Add raw_response column to store full AI answers
ALTER TABLE offsite_queries ADD COLUMN IF NOT EXISTS raw_response TEXT;

-- 2. Update position column to support new bucket types
-- (No change needed, position is already TEXT)

-- 3. Add timestamp for tracking when the check was performed
ALTER TABLE offsite_queries ADD COLUMN IF NOT EXISTS checked_at TIMESTAMP WITH TIME ZONE;

-- 4. Add index for faster queries by engine
CREATE INDEX IF NOT EXISTS idx_offsite_queries_engine ON offsite_queries(engine);

-- Verification: Check the updated schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'offsite_queries';
