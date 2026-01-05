-- Migration: Phase 9b - Person Research Fields
-- Stores Perplexity research about the contact person for personalized outreach

-- Person Research fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_background TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_recent_activity TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_interests TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_talking_points TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_research_done BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_research_at TIMESTAMPTZ;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_leads_person_research ON leads(person_research_done);

-- Comments
COMMENT ON COLUMN leads.person_background IS 'Professional background of the contact (from Perplexity)';
COMMENT ON COLUMN leads.person_recent_activity IS 'Recent posts, talks, or news about the contact';
COMMENT ON COLUMN leads.person_interests IS 'Known interests and topics the person cares about';
COMMENT ON COLUMN leads.person_talking_points IS 'Conversation starters based on research';
COMMENT ON COLUMN leads.person_research_done IS 'Whether person research has been completed';
