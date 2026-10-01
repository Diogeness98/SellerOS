CREATE TABLE defense_analyses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  external_claim_id TEXT NOT NULL,
  prompt_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
  output_json TEXT,
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, claim_id, prompt_name, prompt_version, input_hash)
);

CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  prompt_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  input_units INTEGER,
  output_units INTEGER,
  estimated_cost_usd REAL,
  latency_ms INTEGER,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_defense_analyses_workspace_claim ON defense_analyses(workspace_id, claim_id, status);
CREATE INDEX idx_ai_usage_workspace_claim ON ai_usage(workspace_id, claim_id, created_at);
