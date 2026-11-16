CREATE TABLE auth_pending_signups (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('google','github')),
  subject TEXT NOT NULL,
  email TEXT NOT NULL,
  suggested_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_pending_signup_expiry ON auth_pending_signups(expires_at);
CREATE TABLE auth_consents (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  document TEXT NOT NULL CHECK(document IN ('terms','privacy')),
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,document,version)
);
