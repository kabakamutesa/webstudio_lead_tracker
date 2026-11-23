CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY, name text NOT NULL,
  niche text DEFAULT '', phone text DEFAULT '', email text DEFAULT '', website text DEFAULT '',
  location text DEFAULT '', source text DEFAULT '', status text NOT NULL DEFAULT 'new',
  next_followup text DEFAULT '', notes text DEFAULT '',
  last_contact bigint, created bigint NOT NULL,
  log jsonb NOT NULL DEFAULT '[]',
  deleted_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_live ON leads (status) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text NOT NULL);
