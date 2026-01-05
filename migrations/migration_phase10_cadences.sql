-- Migration: Phase 10 - Multi-Channel Cadences
-- Creates cadence system for automated outreach sequences

-- ================================================
-- CADENCES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS cadences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    total_steps INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- CADENCE STEPS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS cadence_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cadence_id UUID NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    -- Action type: what to do in this step
    action_type TEXT NOT NULL CHECK (action_type IN ('email', 'linkedin_connect', 'linkedin_message', 'wait', 'call')),
    -- Wait days: days to wait BEFORE executing this step (from previous step)
    wait_days INTEGER NOT NULL DEFAULT 0,
    -- For email steps
    email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    -- For LinkedIn steps
    linkedin_message_type TEXT CHECK (linkedin_message_type IN ('connection', 'followup', 'pitch')),
    -- Optional notes for the step
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure unique step numbers per cadence
    UNIQUE(cadence_id, step_number)
);

-- ================================================
-- LEADS TABLE MODIFICATIONS (ADD ONLY)
-- ================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_id UUID REFERENCES cadences(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_started_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_paused BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cadence_completed_at TIMESTAMPTZ;

-- ================================================
-- INDEXES
-- ================================================
CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence_id ON cadence_steps(cadence_id);
CREATE INDEX IF NOT EXISTS idx_cadence_steps_order ON cadence_steps(cadence_id, step_number);
CREATE INDEX IF NOT EXISTS idx_leads_cadence_id ON leads(cadence_id);
CREATE INDEX IF NOT EXISTS idx_leads_next_action_at ON leads(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cadence_active ON leads(cadence_id, cadence_paused) WHERE cadence_id IS NOT NULL;

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON TABLE cadences IS 'Outreach sequences with multiple steps (email, LinkedIn, etc.)';
COMMENT ON TABLE cadence_steps IS 'Individual steps within a cadence';
COMMENT ON COLUMN cadence_steps.action_type IS 'email, linkedin_connect, linkedin_message, wait, call';
COMMENT ON COLUMN cadence_steps.wait_days IS 'Days to wait before this step (from previous step completion)';
COMMENT ON COLUMN leads.cadence_id IS 'Currently assigned cadence (null if not in any cadence)';
COMMENT ON COLUMN leads.cadence_paused IS 'True if cadence is temporarily paused for this lead';
COMMENT ON COLUMN leads.cadence_completed_at IS 'When the lead completed all steps of the cadence';

-- ================================================
-- SEED DATA: Default Cadence
-- ================================================
INSERT INTO cadences (id, name, description, total_steps) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Prospección B2B Estándar', 'Secuencia de 5 touchpoints: 3 emails + 2 LinkedIn en 14 días', 5)
ON CONFLICT DO NOTHING;

-- Default cadence steps
INSERT INTO cadence_steps (cadence_id, step_number, action_type, wait_days, linkedin_message_type, notes) VALUES
    ('00000000-0000-0000-0000-000000000001', 1, 'email', 0, NULL, 'Email de introducción - detectar issues'),
    ('00000000-0000-0000-0000-000000000001', 2, 'wait', 3, NULL, 'Esperar 3 días'),
    ('00000000-0000-0000-0000-000000000001', 3, 'linkedin_connect', 0, 'connection', 'Conectar en LinkedIn'),
    ('00000000-0000-0000-0000-000000000001', 4, 'wait', 2, NULL, 'Esperar 2 días'),
    ('00000000-0000-0000-0000-000000000001', 5, 'email', 0, NULL, 'Follow-up email con valor'),
    ('00000000-0000-0000-0000-000000000001', 6, 'wait', 4, NULL, 'Esperar 4 días'),
    ('00000000-0000-0000-0000-000000000001', 7, 'linkedin_message', 0, 'followup', 'Mensaje LinkedIn de seguimiento'),
    ('00000000-0000-0000-0000-000000000001', 8, 'wait', 5, NULL, 'Esperar 5 días'),
    ('00000000-0000-0000-0000-000000000001', 9, 'email', 0, NULL, 'Email final / breakup')
ON CONFLICT DO NOTHING;

-- Update total_steps
UPDATE cadences SET total_steps = 9 WHERE id = '00000000-0000-0000-0000-000000000001';
