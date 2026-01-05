export type Priority = 'Quick Win' | 'Structural' | 'Authority';
export type Status = 'pending' | 'done';
export type Position = 'top' | 'mid' | 'none';

export interface Client {
  id: string;
  nombre: string;
  dominio: string;
  competidores: string[];
  mercado: string;
  stage: 'prospect' | 'mini' | 'full' | 'retainer' | 'churned';  // Phase 9
  notes?: string;  // Phase 9
  archived?: boolean;  // Phase 9
  created_at: string;
}

export interface Audit {
  id: string;
  client_id: string;
  version: string;
  type: 'mini' | 'full' | 'retainer'; // Phase 1
  score_total: number;
  score_onsite: number;
  score_offsite: number;
  fecha: string;
}

export interface OnsiteResult {
  id: string;
  audit_id: string;
  robots_ok: boolean;
  sitemap_ok: boolean;
  schema_type: string | null;
  canonical_ok: boolean;
  llms_txt_present: boolean;         // Phase 1
  h1_h2_structure_score: number;     // Phase 1 (0-10)
  authority_signals_score: number;   // Phase 1 (0-10)
  answer_box_score: number;          // (0-10)
  notas: string | null;
  created_at: string;
}

// Phase 3: Offsite Results (Entity, Rep, SoV)
export interface OffsiteResult {
  id: string;
  audit_id: string;
  entity_consistency_score: number; // 0-10
  canonical_sources_presence: boolean;
  reputation_score: number; // 0-10
  sov_score: number; // 0-100%
  notas: string | null;
  created_at: string;
}

export interface OffsiteQuery {
  id: string;
  audit_id: string;
  query_text: string;
  engine: string;
  mentioned: boolean;
  competitors_mentioned: string[]; // Phase 3
  sentiment: string | null;        // Phase 3
  position: Position | null;
  screenshot_url: string | null;
  created_at: string;
}

export interface BacklogItem {
  id: string;
  client_id: string;
  task_name: string;
  priority: Priority;
  status: Status;
  created_at: string;
}

// Phase 10: Lead Generation & Outreach
export type OutreachStatus =
  | 'new' | 'scanned' | 'qualified' | 'disqualified'
  | 'intro_sent' | 'intro_opened' | 'intro_replied'
  | 'audit_sent' | 'audit_viewed'
  | 'meeting_requested' | 'meeting_booked' | 'meeting_completed'
  | 'proposal_sent' | 'converted' | 'lost' | 'cold';

export type OutreachChannel = 'email' | 'linkedin' | 'both';

export type LinkedInStatus =
  | 'not_started' | 'profile_viewed' | 'connection_sent'
  | 'connected' | 'message_sent' | 'replied';

export type LeadSource =
  | 'manual' | 'csv_import' | 'hunter' | 'apollo'
  | 'linkedin_search' | 'tavily' | 'referral';

export interface Lead {
  id: string;
  domain: string;
  company_name?: string;
  industry?: string;
  market: string;
  company_size?: string;
  contact_name?: string;
  contact_email?: string;
  contact_role?: string;
  contact_phone?: string;
  linkedin_url?: string;
  linkedin_profile_scraped: boolean;
  quick_scan_done: boolean;
  quick_scan_at?: string;
  robots_ok?: boolean;
  sitemap_ok?: boolean;
  schema_ok?: boolean;
  llms_txt_ok?: boolean;
  canonical_ok?: boolean;
  blocks_gptbot?: boolean;
  quick_score?: number;
  quick_issues?: string[];
  mini_audit_done: boolean;
  mini_audit_id?: string;
  evs_score?: number;
  top_competitor?: string;
  outreach_status: OutreachStatus;
  outreach_channel: OutreachChannel;
  emails_sent: number;
  email_opens: number;
  email_clicks: number;
  email_replies: number;
  last_email_at?: string;
  linkedin_status?: LinkedInStatus;
  linkedin_connection_sent_at?: string;
  linkedin_connected_at?: string;
  last_linkedin_at?: string;
  sequence_step: number;
  sequence_started_at?: string;
  next_action_at?: string;
  next_action_type?: string;
  converted_to_client_id?: string;
  lost_reason?: string;
  source: LeadSource;
  tags?: string[];
  notes?: string;
  assigned_to?: string;
  // AI Research fields (Perplexity)
  company_description?: string;
  company_industry?: string;
  company_stage?: string;
  employee_count?: string;
  recent_news?: string;
  tech_stack?: string[];
  pain_points?: string[];
  competitors?: string[];
  ai_research_done: boolean;
  ai_research_at?: string;
  ai_research_source?: string;
  // Deep Scan fields
  deep_scan_done: boolean;
  deep_scan_at?: string;
  deep_scan_results?: Record<string, unknown>;
  evs_score_estimate?: number;
  created_at: string;
  updated_at: string;
}

export type MeetingStatus =
  | 'scheduled' | 'confirmed' | 'rescheduled'
  | 'cancelled' | 'completed' | 'no_show';

export interface Meeting {
  id: string;
  lead_id: string;
  calendly_event_id?: string;
  calendly_event_uri?: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_type: string;
  meeting_link?: string;
  status: MeetingStatus;
  outcome?: string;
  outcome_notes?: string;
  next_steps?: string;
  created_at: string;
}

export type EmailTemplateType =
  | 'intro' | 'follow_up_1' | 'follow_up_2' | 'break_up'
  | 'audit_delivery' | 'meeting_request' | 'meeting_confirmation';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_markdown: string;
  variables?: string[];
  template_type?: EmailTemplateType;
  times_used: number;
  avg_open_rate?: number;
  avg_reply_rate?: number;
  is_active: boolean;
  created_at: string;
}

export interface OutreachLog {
  id: string;
  lead_id: string;
  action_type: string;
  channel: string;
  template_id?: string;
  message_preview?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client;
        Insert: Omit<Client, 'id' | 'created_at'>;
        Update: Partial<Omit<Client, 'id' | 'created_at'>>;
      };
      audits: {
        Row: Audit;
        Insert: Omit<Audit, 'id' | 'fecha'>;
        Update: Partial<Omit<Audit, 'id' | 'fecha'>>;
      };
      onsite_results: {
        Row: OnsiteResult;
        Insert: Omit<OnsiteResult, 'id' | 'created_at'>;
        Update: Partial<Omit<OnsiteResult, 'id' | 'created_at'>>;
      };
      offsite_queries: {
        Row: OffsiteQuery;
        Insert: Omit<OffsiteQuery, 'id' | 'created_at'>;
        Update: Partial<Omit<OffsiteQuery, 'id' | 'created_at'>>;
      };
      backlog: {
        Row: BacklogItem;
        Insert: Omit<BacklogItem, 'id' | 'created_at'>;
        Update: Partial<Omit<BacklogItem, 'id' | 'created_at'>>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Lead, 'id' | 'created_at'>>;
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'>;
        Update: Partial<Omit<Meeting, 'id' | 'created_at'>>;
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Omit<EmailTemplate, 'id' | 'created_at'>;
        Update: Partial<Omit<EmailTemplate, 'id' | 'created_at'>>;
      };
      outreach_logs: {
        Row: OutreachLog;
        Insert: Omit<OutreachLog, 'id' | 'created_at'>;
        Update: Partial<Omit<OutreachLog, 'id' | 'created_at'>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

