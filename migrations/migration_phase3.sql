-- Migration Phase 3: Off-site Intelligence & Competitive SoV

-- 1. Create table for Off-site Qualitative Results (Entity, Sources, Reputation)
CREATE TABLE offsite_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  entity_consistency_score INTEGER CHECK (entity_consistency_score >= 0 AND entity_consistency_score <= 10),
  canonical_sources_presence BOOLEAN DEFAULT false,
  reputation_score INTEGER CHECK (reputation_score >= 0 AND reputation_score <= 10),
  sov_score INTEGER CHECK (sov_score >= 0 AND sov_score <= 100), -- Share of Voice %
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update offsite_queries to store AI Analysis details (Optional but good for debug)
-- We already have 'mentioned' and 'position'. We might want to add 'competitors_mentioned'
ALTER TABLE offsite_queries ADD COLUMN competitors_mentioned TEXT[] DEFAULT '{}';
ALTER TABLE offsite_queries ADD COLUMN sentiment TEXT; -- 'Positive', 'Neutral', 'Negative'

-- 3. Create table for Competitive Benchmarks (optional, or just store in offsite_results/queries)
-- For now, we fit everything in offsite_queries (per query) and offsite_results (aggregate).

-- Enable RLS
ALTER TABLE offsite_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access for all tables" ON offsite_results FOR ALL USING (true);
