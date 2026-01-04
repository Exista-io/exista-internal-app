-- Phase 10: Lead Generation & Outreach Platform
-- Creates tables for leads, meetings, email_templates, and outreach_logs

-- =============================================================================
-- TABLE: leads
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificación
  domain TEXT NOT NULL UNIQUE,
  company_name TEXT,
  industry TEXT,
  market TEXT DEFAULT 'AR',
  company_size TEXT, -- 'startup', 'pyme', 'enterprise'
  
  -- Contacto (de Hunter.io/Apollo)
  contact_name TEXT,
  contact_email TEXT,
  contact_role TEXT, -- 'CEO', 'CMO', 'Marketing Manager'
  contact_phone TEXT,
  linkedin_url TEXT,
  linkedin_profile_scraped BOOLEAN DEFAULT false,
  
  -- Quick Scan Results (pre-calificación sin AI)
  quick_scan_done BOOLEAN DEFAULT false,
  quick_scan_at TIMESTAMPTZ,
  robots_ok BOOLEAN,
  sitemap_ok BOOLEAN,
  schema_ok BOOLEAN,
  llms_txt_ok BOOLEAN,
  canonical_ok BOOLEAN,
  blocks_gptbot BOOLEAN,
  quick_score INTEGER CHECK (quick_score >= 0 AND quick_score <= 100),
  quick_issues TEXT[],
  
  -- Mini-Audit (si califica)
  mini_audit_done BOOLEAN DEFAULT false,
  mini_audit_id UUID REFERENCES audits(id),
  evs_score INTEGER,
  top_competitor TEXT,
  
  -- Outreach Status
  outreach_status TEXT DEFAULT 'new' CHECK (outreach_status IN (
    'new', 'scanned', 'qualified', 'disqualified',
    'intro_sent', 'intro_opened', 'intro_replied',
    'audit_sent', 'audit_viewed',
    'meeting_requested', 'meeting_booked', 'meeting_completed',
    'proposal_sent', 'converted', 'lost', 'cold'
  )),
  
  -- Multi-channel tracking
  outreach_channel TEXT DEFAULT 'email' CHECK (outreach_channel IN ('email', 'linkedin', 'both')),
  
  -- Email tracking
  emails_sent INTEGER DEFAULT 0,
  email_opens INTEGER DEFAULT 0,
  email_clicks INTEGER DEFAULT 0,
  email_replies INTEGER DEFAULT 0,
  last_email_at TIMESTAMPTZ,
  
  -- LinkedIn tracking
  linkedin_status TEXT CHECK (linkedin_status IN (
    'not_started', 'profile_viewed', 'connection_sent', 
    'connected', 'message_sent', 'replied'
  )),
  linkedin_connection_sent_at TIMESTAMPTZ,
  linkedin_connected_at TIMESTAMPTZ,
  last_linkedin_at TIMESTAMPTZ,
  
  -- Sequence tracking
  sequence_step INTEGER DEFAULT 0,
  sequence_started_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  next_action_type TEXT, -- 'email', 'linkedin_view', 'linkedin_connect', etc.
  
  -- Conversión
  converted_to_client_id UUID REFERENCES clients(id),
  lost_reason TEXT,
  
  -- Meta
  source TEXT DEFAULT 'manual' CHECK (source IN (
    'manual', 'csv_import', 'hunter', 'apollo', 'linkedin_search', 'tavily', 'referral'
  )),
  tags TEXT[],
  notes TEXT,
  assigned_to TEXT, -- Para equipos
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para leads
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);
CREATE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain);
CREATE INDEX IF NOT EXISTS idx_leads_quick_score ON leads(quick_score);

-- =============================================================================
-- TABLE: meetings
-- =============================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Calendly data
  calendly_event_id TEXT UNIQUE,
  calendly_event_uri TEXT,
  
  -- Detalles
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 15,
  meeting_type TEXT DEFAULT 'evs_discovery', -- 'evs_discovery', 'proposal', 'onboarding'
  meeting_link TEXT, -- Zoom/Meet URL
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'
  )),
  
  -- Outcome
  outcome TEXT, -- 'qualified', 'not_fit', 'follow_up', 'proposal_sent'
  outcome_notes TEXT,
  next_steps TEXT,
  
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para meetings
CREATE INDEX IF NOT EXISTS idx_meetings_lead ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON meetings(scheduled_at);

-- =============================================================================
-- TABLE: email_templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  
  -- Variables disponibles
  variables TEXT[], -- ['company_name', 'contact_name', 'evs_score', 'quick_issues']
  
  -- Categoría
  template_type TEXT CHECK (template_type IN (
    'intro', 'follow_up_1', 'follow_up_2', 'break_up',
    'audit_delivery', 'meeting_request', 'meeting_confirmation'
  )),
  
  -- Stats
  times_used INTEGER DEFAULT 0,
  avg_open_rate NUMERIC,
  avg_reply_rate NUMERIC,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- TABLE: outreach_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS outreach_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL, -- 'email_sent', 'email_opened', 'linkedin_connect', etc.
  channel TEXT NOT NULL, -- 'email', 'linkedin'
  
  -- Detalles
  template_id UUID REFERENCES email_templates(id),
  message_preview TEXT,
  
  -- Resultado
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para outreach_logs
CREATE INDEX IF NOT EXISTS idx_outreach_logs_lead ON outreach_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_created ON outreach_logs(created_at);

-- =============================================================================
-- Enable RLS
-- =============================================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now, restrict later based on user auth)
CREATE POLICY "Allow all access on leads" ON leads FOR ALL USING (true);
CREATE POLICY "Allow all access on meetings" ON meetings FOR ALL USING (true);
CREATE POLICY "Allow all access on email_templates" ON email_templates FOR ALL USING (true);
CREATE POLICY "Allow all access on outreach_logs" ON outreach_logs FOR ALL USING (true);

-- =============================================================================
-- Insert default email templates
-- =============================================================================
INSERT INTO email_templates (name, subject, body_markdown, variables, template_type) VALUES
(
  'Intro - ChatGPT no te recomienda',
  '{{company_name}}, ChatGPT no te recomienda (tengo evidencia)',
  E'Hola {{contact_name}},\n\nVi que {{domain}} tiene problemas técnicos que impiden que los motores de IA (ChatGPT, Claude, Perplexity) te recomienden:\n\n{{quick_issues}}\n\nMientras tanto, {{top_competitor}} aparece en el 60% de las búsquedas de tu categoría.\n\n¿Te interesa ver el diagnóstico completo gratis?\n\n👉 [Agendar 15 min]({{calendly_link}})\n\nSaludos,\n{{sender_name}}\nExista.io',
  ARRAY['company_name', 'contact_name', 'domain', 'quick_issues', 'top_competitor', 'calendly_link', 'sender_name'],
  'intro'
),
(
  'Follow-up 1 - Resumen Quick Scan',
  'Re: {{company_name}}, ChatGPT no te recomienda',
  E'{{contact_name}},\n\nSolo un follow-up rápido del email anterior.\n\nEl resumen: {{domain}} no es "citable" por IA porque:\n• {{quick_issue_1}}\n\nPuedo mostrarte exactamente qué hacer en 15 min.\n\n👉 [Agendar llamada]({{calendly_link}})\n\n{{sender_name}}',
  ARRAY['company_name', 'contact_name', 'domain', 'quick_issue_1', 'calendly_link', 'sender_name'],
  'follow_up_1'
),
(
  'Break-up - Última oportunidad',
  '¿Cierro tu caso?',
  E'{{contact_name}},\n\nNo quiero spamear. Esta es mi última pregunta:\n\n¿Debería dejar de escribirte sobre visibilidad en IA?\n\nSi no es el momento, no hay problema. Si querés ver el diagnóstico otro día, responde "después" y te contacto en 3 meses.\n\n{{sender_name}}',
  ARRAY['contact_name', 'sender_name'],
  'break_up'
);

-- Verify
SELECT 'leads' as table_name, COUNT(*) as count FROM leads
UNION ALL
SELECT 'meetings', COUNT(*) FROM meetings
UNION ALL
SELECT 'email_templates', COUNT(*) FROM email_templates
UNION ALL
SELECT 'outreach_logs', COUNT(*) FROM outreach_logs;
