-- Create clients table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  dominio TEXT NOT NULL,
  competidores TEXT[] DEFAULT '{}',
  mercado TEXT DEFAULT 'AR',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create audits table
CREATE TABLE audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  score_total NUMERIC,
  score_onsite NUMERIC,
  score_offsite NUMERIC,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create onsite_results table
CREATE TABLE onsite_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  robots_ok BOOLEAN DEFAULT false,
  sitemap_ok BOOLEAN DEFAULT false,
  schema_type TEXT,
  canonical_ok BOOLEAN DEFAULT false,
  answer_box_score INTEGER CHECK (answer_box_score >= 0 AND answer_box_score <= 10),
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create offsite_queries table
CREATE TABLE offsite_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  engine TEXT NOT NULL, -- 'ChatGPT', 'Claude', etc
  mentioned BOOLEAN DEFAULT false,
  position TEXT, -- 'top', 'mid', 'none'
  screenshot_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create backlog table
CREATE TABLE backlog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  priority TEXT NOT NULL, -- 'Quick Win', 'Structural', 'Authority'
  status TEXT DEFAULT 'pending', -- 'pending', 'done'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE offsite_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog ENABLE ROW LEVEL SECURITY;

-- Create policies (Example: Allow all access for now, can be restricted later)
-- Note: In a real app, you'd likely want to restrict this based on user auth.
CREATE POLICY "Allow public access for all tables" ON clients FOR ALL USING (true);
CREATE POLICY "Allow public access for all tables" ON audits FOR ALL USING (true);
CREATE POLICY "Allow public access for all tables" ON onsite_results FOR ALL USING (true);
CREATE POLICY "Allow public access for all tables" ON offsite_queries FOR ALL USING (true);
CREATE POLICY "Allow public access for all tables" ON backlog FOR ALL USING (true);
