-- Phase 9: Client Lifecycle Stages & Notes
-- Adds stage tracking and notes field to clients table

-- Add stage column with default 'prospect'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'prospect';

-- Add notes column for context/sales notes
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add archived column for hiding test/old clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Add owner_type to actions (exista = our task, client = client's task)
ALTER TABLE audit_actions ADD COLUMN IF NOT EXISTS owner_type TEXT DEFAULT 'exista';

-- Update existing clients based on their audit history
UPDATE clients c
SET stage = CASE
    WHEN EXISTS (SELECT 1 FROM audits a WHERE a.client_id = c.id AND a.type = 'retainer') THEN 'retainer'
    WHEN EXISTS (SELECT 1 FROM audits a WHERE a.client_id = c.id AND a.type = 'full') THEN 'full'
    WHEN EXISTS (SELECT 1 FROM audits a WHERE a.client_id = c.id AND a.type = 'mini') THEN 'mini'
    ELSE 'prospect'
END
WHERE stage IS NULL OR stage = 'prospect';

-- Verify the update
SELECT 
    stage, 
    COUNT(*) as count 
FROM clients 
GROUP BY stage;
