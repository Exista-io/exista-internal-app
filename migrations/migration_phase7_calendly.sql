-- Migration: Phase 7 - Calendly Integration (Meetings Table)
-- Stores meetings scheduled via Calendly webhooks

CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Lead association (nullable - might be unknown invitee)
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Invitee info from Calendly
    invitee_email TEXT NOT NULL,
    invitee_name TEXT,
    invitee_first_name TEXT,
    invitee_last_name TEXT,
    invitee_timezone TEXT,
    
    -- Event info
    event_uri TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    event_type_name TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'
    
    -- Calendly URLs
    cancel_url TEXT,
    reschedule_url TEXT,
    
    -- Webhook raw data (for debugging)
    calendly_payload JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meetings_lead_id ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_invitee_email ON meetings(invitee_email);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);

-- Comments
COMMENT ON TABLE meetings IS 'Meetings scheduled via Calendly webhooks';
COMMENT ON COLUMN meetings.lead_id IS 'Associated lead (matched by email)';
COMMENT ON COLUMN meetings.event_uri IS 'Calendly event URI for API calls';
COMMENT ON COLUMN meetings.calendly_payload IS 'Full webhook payload for debugging';
