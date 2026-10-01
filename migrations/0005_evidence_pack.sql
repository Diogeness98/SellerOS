CREATE TABLE customer_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  external_claim_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  sender_role TEXT,
  receiver_role TEXT,
  message_text TEXT,
  message_date TEXT,
  external_created_at TEXT,
  external_updated_at TEXT,
  date_read TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_claim_id, external_id)
);

CREATE TABLE evidence_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  external_claim_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type = 'CLAIM_MESSAGE_ATTACHMENT'),
  external_id TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  external_created_at TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_claim_id, external_id)
);

CREATE TABLE claim_evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES customer_messages(id) ON DELETE CASCADE,
  evidence_asset_id TEXT NOT NULL REFERENCES evidence_assets(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, claim_id, evidence_asset_id)
);

CREATE INDEX idx_customer_messages_workspace_claim_date ON customer_messages(workspace_id, claim_id, message_date);
CREATE INDEX idx_customer_messages_external_claim ON customer_messages(workspace_id, external_claim_id);
CREATE INDEX idx_evidence_assets_workspace_claim ON evidence_assets(workspace_id, claim_id);
CREATE INDEX idx_evidence_assets_external_claim_asset ON evidence_assets(workspace_id, external_claim_id, external_id);
CREATE INDEX idx_claim_evidence_workspace_claim ON claim_evidence(workspace_id, claim_id);
