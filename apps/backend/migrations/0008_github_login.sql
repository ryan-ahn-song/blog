CREATE TABLE auth_github_accounts (
  subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE
);
CREATE TABLE auth_github_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  origin TEXT NOT NULL,
  link_user_id TEXT REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_github_states_expiry ON auth_github_states(expires_at);
