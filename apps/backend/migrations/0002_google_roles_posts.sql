CREATE TABLE auth_users_next (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'author', 'admin')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO auth_users_next(id,email,name,password_hash,role,disabled,created_at)
  SELECT id,email,name,password_hash,role,disabled,created_at FROM auth_users;
CREATE TABLE auth_sessions_backup AS SELECT * FROM auth_sessions;
DROP TABLE auth_sessions;
DROP TABLE auth_users;
ALTER TABLE auth_users_next RENAME TO auth_users;
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO auth_sessions SELECT * FROM auth_sessions_backup;
DROP TABLE auth_sessions_backup;
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_google_accounts (
  subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE
);
CREATE TABLE auth_oauth_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  origin TEXT NOT NULL,
  link_user_id TEXT REFERENCES auth_users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_oauth_expiry ON auth_oauth_states(expires_at);
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES auth_users(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tech', 'life')),
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE INDEX posts_feed ON posts(status, published_at DESC, id);
CREATE INDEX posts_author ON posts(author_id, updated_at DESC);
