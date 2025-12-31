-- EVS v3.0 Migration: Fix Save Audit Bug (Missing Columns)
-- Run this in Supabase SQL Editor

-- 1. Add 'type' column to audits (mini, full, retainer)
ALTER TABLE audits ADD COLUMN IF NOT EXISTS type TEXT;

-- 2. Add missing columns to onsite_results
ALTER TABLE onsite_results ADD COLUMN IF NOT EXISTS llms_txt_present BOOLEAN DEFAULT false;
ALTER TABLE onsite_results ADD COLUMN IF NOT EXISTS h1_h2_structure_score INTEGER CHECK (h1_h2_structure_score >= 0 AND h1_h2_structure_score <= 10);
ALTER TABLE onsite_results ADD COLUMN IF NOT EXISTS authority_signals_score INTEGER CHECK (authority_signals_score >= 0 AND authority_signals_score <= 10);

-- 3. Add industria and descripcion to clients for Contextual Query Intelligence
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industria TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- Verification: Check updated schema
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('audits', 'onsite_results', 'clients')
ORDER BY table_name, ordinal_position;
