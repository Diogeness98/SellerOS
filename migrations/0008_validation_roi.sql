ALTER TABLE integrations ADD COLUMN oauth_completed_at TEXT;
ALTER TABLE integrations ADD COLUMN first_sync_started_at TEXT;
ALTER TABLE integrations ADD COLUMN first_sync_completed_at TEXT;
ALTER TABLE integrations ADD COLUMN first_value_rendered_at TEXT;
ALTER TABLE claims ADD COLUMN reputation_impact TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (reputation_impact IN ('AFFECTED', 'NOT_AFFECTED', 'NOT_APPLICABLE', 'UNKNOWN'));

CREATE TABLE return_financial_outcomes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  return_id TEXT REFERENCES returns(id) ON DELETE SET NULL,
  amount_at_risk_cents INTEGER NOT NULL DEFAULT 0,
  recovered_amount_cents INTEGER NOT NULL DEFAULT 0,
  protected_amount_cents INTEGER NOT NULL DEFAULT 0,
  lost_amount_cents INTEGER NOT NULL DEFAULT 0,
  attribution_status TEXT NOT NULL CHECK (attribution_status IN ('CONFIRMED_RECOVERED', 'ASSISTED', 'NOT_ATTRIBUTABLE', 'PENDING')),
  source TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, claim_id)
);
CREATE INDEX idx_outcomes_workspace_resolved ON return_financial_outcomes(workspace_id, resolved_at);

CREATE TABLE validation_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_validation_events_workspace_name_created ON validation_events(workspace_id, event_name, created_at);
