CREATE TABLE platform_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_configuration (
  code TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_readiness_checks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED', 'PARTIAL', 'PASS', 'FAIL', 'NOT_APPLICABLE', 'NEEDS_REVIEW')),
  requirement_type TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source_url TEXT,
  source_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_gmve_monthly (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  active_sellers INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  gross_amount_brl REAL NOT NULL DEFAULT 0,
  fx_rate REAL,
  fx_date TEXT,
  fx_source TEXT,
  gmve_usd_estimate REAL,
  calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_evidence (
  id TEXT PRIMARY KEY,
  requirement_code TEXT NOT NULL REFERENCES dpp_readiness_checks(code) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('AUTOMATED_TEST', 'CODE_REFERENCE', 'CONFIG_REFERENCE', 'LOG_REFERENCE', 'SCREENSHOT_REFERENCE', 'DOCUMENT', 'MANUAL_REVIEW')),
  description TEXT NOT NULL,
  reference TEXT,
  metadata_json TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_initiatives (
  id TEXT PRIMARY KEY,
  external_reference TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  mandatory INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  due_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'OVERDUE', 'NOT_APPLICABLE')),
  source_url TEXT,
  evidence_id TEXT REFERENCES dpp_evidence(id) ON DELETE SET NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_incidents (
  id TEXT PRIMARY KEY,
  discovered_at TEXT NOT NULL,
  systems_affected TEXT NOT NULL,
  potentially_affected_users INTEGER,
  containment_actions TEXT,
  responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  communication_status TEXT NOT NULL DEFAULT 'HUMAN_REVIEW_REQUIRED',
  resolved_at TEXT,
  postmortem TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dpp_webhook_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  error_code TEXT
);

CREATE TABLE dpp_admin_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dpp_evidence_requirement ON dpp_evidence(requirement_code, created_at);
CREATE INDEX idx_dpp_initiatives_due ON dpp_initiatives(due_at, status);
CREATE INDEX idx_dpp_webhook_events_status ON dpp_webhook_events(status, received_at);

INSERT OR IGNORE INTO dpp_configuration (code, value, source, verified_at) VALUES
  ('DPP_COUNTRY', 'MLB', 'SellerOS internal configuration', NULL),
  ('DPP_GMVE_TARGET_USD', '2500000', 'Known DPP Brazil threshold; human verification required', NULL),
  ('DPP_SECURITY_MINIMUM', '65', 'Known DPP security assessment minimum; human verification required', NULL);

INSERT OR IGNORE INTO dpp_readiness_checks (id, code, category, title, description, status, requirement_type) VALUES
  ('c1', 'ML_APP_CONFIGURED', 'Integration', 'Mercado Livre application configuration', 'OAuth configuration is available only through Worker environment bindings.', 'PARTIAL', 'AUTOMATED'),
  ('c2', 'OAUTH_CALLBACK_HTTPS', 'OAuth', 'HTTPS callback', 'The configured callback must use HTTPS.', 'PASS', 'AUTOMATED'),
  ('c3', 'OAUTH_STATE_VALIDATION', 'OAuth', 'OAuth state validation', 'Authorization attempts are state-bound, expiring and single-use.', 'PASS', 'AUTOMATED'),
  ('c4', 'TOKEN_BACKEND_ONLY', 'Security', 'Tokens remain server-side', 'Access and refresh tokens are never returned to the browser.', 'PASS', 'AUTOMATED'),
  ('c5', 'TOKEN_LOG_REDACTION', 'Security', 'Token redaction', 'Operational logs and API responses must not contain credentials.', 'PASS', 'AUTOMATED'),
  ('c6', 'REFRESH_ROTATION', 'Security', 'Refresh token rotation', 'Refreshed credentials replace encrypted values only after a successful response.', 'PASS', 'AUTOMATED'),
  ('c7', 'WORKSPACE_ISOLATION', 'Security', 'Workspace isolation', 'All seller data access is bound to the signed session workspace.', 'PASS', 'AUTOMATED'),
  ('c8', 'WEBHOOK_IDEMPOTENCY', 'Resilience', 'Webhook idempotency', 'Duplicate notification event identifiers are recorded once.', 'PARTIAL', 'AUTOMATED'),
  ('c9', 'RATE_LIMIT_HANDLING', 'Resilience', 'Rate limit handling', 'Persistent rate limits protect mutable operations.', 'PASS', 'AUTOMATED'),
  ('c10', 'API_RETRY_POLICY', 'Resilience', 'API retry policy', 'Retries require an explicit safe operation policy.', 'NEEDS_REVIEW', 'MANUAL'),
  ('c11', 'DISCONNECT_FLOW', 'Privacy', 'Disconnect flow', 'Disconnect clears local encrypted credentials and records an audit event.', 'PASS', 'AUTOMATED'),
  ('c12', 'AUDIT_LOGGING', 'Security', 'Audit logging', 'Security-relevant application actions retain an audit trail.', 'PASS', 'AUTOMATED'),
  ('c13', 'PRIVACY_POLICY', 'LGPD', 'Privacy policy', 'Requires human legal review.', 'NEEDS_REVIEW', 'MANUAL'),
  ('c14', 'ACCOUNT_DELETION', 'LGPD', 'Account deletion', 'Requires human legal and product review.', 'NEEDS_REVIEW', 'MANUAL'),
  ('c15', 'SECURITY_INCIDENT_RESPONSE', 'Security', 'Incident response process', 'Incident records require human containment and communication decisions.', 'PARTIAL', 'MANUAL'),
  ('c16', 'SECURITY_TESTS', 'Security', 'Security regression tests', 'Automated authentication, token and isolation tests are required.', 'PASS', 'AUTOMATED'),
  ('c17', 'GMVE_TRACKING', 'GMVe', 'GMVe tracking', 'Estimated GMVe uses only synchronized orders and audited FX data.', 'PARTIAL', 'AUTOMATED'),
  ('c18', 'ACTIVE_SELLER_TRACKING', 'GMVe', 'Active seller tracking', 'Active sellers are calculated from synchronized order activity.', 'PARTIAL', 'AUTOMATED'),
  ('c19', 'DPP_MANDATORY_CHANGE_PROCESS', 'Initiatives', 'Mandatory change process', 'Official changes and deadlines are tracked manually with evidence.', 'PARTIAL', 'MANUAL');
