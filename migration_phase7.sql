-- Migration: Add missing columns to offsite_queries for EVS v3.0 reports
-- Run this in Supabase SQL Editor

-- Add bucket column to track position type (Top Answer, Mentioned, Cited, Not Found)
ALTER TABLE offsite_queries 
ADD COLUMN IF NOT EXISTS bucket TEXT DEFAULT 'Not Found';

-- Add competitors_mentioned column to track which competitors appear in each response
ALTER TABLE offsite_queries 
ADD COLUMN IF NOT EXISTS competitors_mentioned TEXT[] DEFAULT '{}';

-- Add sentiment column to track response sentiment
ALTER TABLE offsite_queries 
ADD COLUMN IF NOT EXISTS sentiment TEXT DEFAULT 'Neutral';

-- Verify the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'offsite_queries' 
ORDER BY ordinal_position;
