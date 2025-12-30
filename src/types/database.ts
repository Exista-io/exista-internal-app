export type Priority = 'Quick Win' | 'Structural' | 'Authority';
export type Status = 'pending' | 'done';
export type Position = 'top' | 'mid' | 'none';

export interface Client {
  id: string;
  nombre: string;
  dominio: string;
  competidores: string[];
  mercado: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
