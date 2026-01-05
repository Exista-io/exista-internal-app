-- Migration: Phase 8 - AI Lead Research + Deep Scan
-- Adds fields for AI-powered lead enrichment and full site audit

-- AI Research fields (Perplexity)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_description TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_industry TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_stage TEXT; -- 'startup', 'growth', 'enterprise'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS employee_count TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recent_news TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tech_stack TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_points TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitors TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_research_done BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_research_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_research_source TEXT; -- 'perplexity' | 'gemini'

-- Deep Scan fields (Onsite Audit completo)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_scan_done BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_scan_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_scan_results JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS evs_score_estimate INTEGER;

-- Index for filtering by research status
CREATE INDEX IF NOT EXISTS idx_leads_ai_research ON leads(ai_research_done);
CREATE INDEX IF NOT EXISTS idx_leads_deep_scan ON leads(deep_scan_done);

-- Comments
COMMENT ON COLUMN leads.company_description IS 'What the company does (from AI Research)';
COMMENT ON COLUMN leads.company_industry IS 'Specific industry (from AI Research)';
COMMENT ON COLUMN leads.company_stage IS 'Company stage: startup, growth, enterprise';
COMMENT ON COLUMN leads.employee_count IS 'Estimated employee count range';
COMMENT ON COLUMN leads.recent_news IS 'Recent relevant news about the company';
COMMENT ON COLUMN leads.tech_stack IS 'Technologies detected (from AI Research)';
COMMENT ON COLUMN leads.pain_points IS 'Potential pain points identified';
COMMENT ON COLUMN leads.competitors IS 'Main competitors identified';
COMMENT ON COLUMN leads.ai_research_source IS 'AI engine used: perplexity or gemini';
COMMENT ON COLUMN leads.deep_scan_results IS 'Full Onsite Audit results (same as client audit)';
COMMENT ON COLUMN leads.evs_score_estimate IS 'Estimated EVS score from Deep Scan';
