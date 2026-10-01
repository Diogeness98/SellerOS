CREATE TABLE products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT,
  category_id TEXT,
  currency_id TEXT,
  price REAL,
  seller_sku TEXT,
  external_created_at TEXT,
  external_updated_at TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_id)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  external_id TEXT NOT NULL,
  status TEXT,
  currency_id TEXT,
  total_amount REAL,
  paid_amount REAL,
  external_created_at TEXT,
  external_closed_at TEXT,
  external_updated_at TEXT,
  raw_hash TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, channel, external_id)
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  external_item_id TEXT NOT NULL,
  title TEXT,
  seller_sku TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL,
  currency_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, order_id, external_item_id)
);

CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel = 'MERCADOLIVRE'),
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  started_at TEXT,
  finished_at TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_workspace_channel ON products(workspace_id, channel);
CREATE INDEX idx_orders_workspace_channel_updated ON orders(workspace_id, channel, external_updated_at);
CREATE INDEX idx_order_items_workspace_order ON order_items(workspace_id, order_id);
CREATE INDEX idx_sync_jobs_workspace_created ON sync_jobs(workspace_id, created_at);
CREATE UNIQUE INDEX idx_sync_jobs_single_running ON sync_jobs(workspace_id, integration_id) WHERE status = 'RUNNING';
