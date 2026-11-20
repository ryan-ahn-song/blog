-- OAuth provider storage is adapted to D1: token secrets remain hashed/encrypted
-- by the upstream provider. No additional paid service or KV binding is required.
CREATE TABLE mcp_oauth_storage (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  metadata TEXT,
  user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER
);
CREATE INDEX mcp_oauth_expiry ON mcp_oauth_storage(expires_at);
CREATE INDEX mcp_oauth_owner ON mcp_oauth_storage(user_id);
CREATE TABLE mcp_locks (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE mcp_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  grant_id TEXT UNIQUE,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_domain TEXT,
  redirect_host TEXT NOT NULL,
  scope TEXT NOT NULL,
  consent_version TEXT NOT NULL DEFAULT '2026-11-20.1',
  login_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX mcp_connections_owner ON mcp_connections(user_id,created_at DESC);
CREATE INDEX mcp_connections_expiry ON mcp_connections(expires_at);
CREATE TABLE mcp_flows (
  id TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  request_json TEXT NOT NULL,
  description_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mcp_flows_expiry ON mcp_flows(expires_at);
CREATE TABLE mcp_operations (
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result TEXT,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(connection_id,request_key)
);
CREATE TABLE mcp_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  post_id TEXT,
  outcome TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX mcp_audit_owner ON mcp_audit(user_id,id DESC);
CREATE INDEX mcp_audit_expiry ON mcp_audit(created_at);
CREATE INDEX mcp_operations_expiry ON mcp_operations(expires_at);
