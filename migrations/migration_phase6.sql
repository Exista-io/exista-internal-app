-- Migration Phase 6: AI-Powered Audit Reports
-- Run this in Supabase SQL Editor

-- Table for storing generated reports
CREATE TABLE IF NOT EXISTS audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    report_type TEXT NOT NULL, -- 'mini', 'full', 'retainer'
    report_markdown TEXT, -- Full report as markdown
    report_data JSONB, -- Structured data for UI rendering
    
    -- Metrics snapshot (for retainer comparison)
    evs_score INTEGER,
    sov_brand DECIMAL,
    sov_competitors JSONB, -- {"competitor_name": sov_percentage}
    
    generated_at TIMESTAMP DEFAULT NOW(),
    version TEXT -- 'v1.0', 'v1.1'
);

-- Table for tracking action items from reports
CREATE TABLE IF NOT EXISTS audit_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    report_id UUID REFERENCES audit_reports(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Action details
    priority INTEGER NOT NULL, -- 1-5
    emoji TEXT, -- '🚀', '⚙️', '📈', '🔧'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Effort matrix
    impact TEXT NOT NULL, -- 'alto', 'medio', 'bajo'
    difficulty TEXT NOT NULL, -- 'facil', 'media', 'dificil'
    estimated_time TEXT NOT NULL, -- '1-2 horas', '1 semana', etc.
    
    -- Tracking for retainers
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'done', 'blocked'
    assigned_to TEXT,
    due_date DATE,
    completed_at TIMESTAMP,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_reports_client ON audit_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_audit ON audit_reports(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_client ON audit_actions(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_actions_status ON audit_actions(status);
CREATE INDEX IF NOT EXISTS idx_audit_actions_priority ON audit_actions(priority);
