ALTER TABLE audits 
ADD COLUMN type TEXT DEFAULT 'full' CHECK (type IN ('mini', 'full', 'retainer'));

ALTER TABLE onsite_results
ADD COLUMN llms_txt_present BOOLEAN DEFAULT false,
ADD COLUMN h1_h2_structure_score INTEGER DEFAULT 0 CHECK (h1_h2_structure_score >= 0 AND h1_h2_structure_score <= 10),
ADD COLUMN authority_signals_score INTEGER DEFAULT 0 CHECK (authority_signals_score >= 0 AND authority_signals_score <= 10);
