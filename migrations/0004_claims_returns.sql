CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  external_id TEXT NOT NULL,
  resource TEXT,
  external_resource_id TEXT,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT,
  type TEXT,
  stage TEXT,
  parent_external_id TEXT,
  reason_id TEXT,
  fulfilled INTEGER,
  quantity_type TEXT,
  claimed_quantity INTEGER,
  site_id TEXT,
  due_date TEXT,
  action_responsible TEXT,
  title TEXT,
  problem TEXT,
  has_return INTEGER NOT NULL DEFAULT 0,
  resolution_reason TEXT,
  resolution_closed_by TEXT,
  resolution_applied_coverage INTEGER,
  external_created_at TEXT,
  external_updated_at TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_id)
);

CREATE TABLE returns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  external_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  external_claim_id TEXT NOT NULL,
  external_resource_id TEXT,
  status TEXT,
  subtype TEXT,
  resource_type TEXT,
  status_money TEXT,
  refund_at TEXT,
  date_closed TEXT,
  external_created_at TEXT,
  external_updated_at TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_id)
);

CREATE INDEX idx_claims_workspace_channel_status ON claims(workspace_id, channel, status);
CREATE INDEX idx_claims_external_resource ON claims(workspace_id, external_resource_id);
CREATE INDEX idx_claims_due_date ON claims(workspace_id, due_date);
CREATE INDEX idx_claims_external_updated ON claims(workspace_id, external_updated_at);
CREATE INDEX idx_returns_workspace_channel_status ON returns(workspace_id, channel, status);
CREATE INDEX idx_returns_external_resource ON returns(workspace_id, external_resource_id);
CREATE INDEX idx_returns_external_updated ON returns(workspace_id, external_updated_at);
