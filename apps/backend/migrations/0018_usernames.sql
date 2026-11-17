ALTER TABLE auth_users ADD COLUMN username TEXT;
ALTER TABLE auth_users ADD COLUMN username_key TEXT;
ALTER TABLE auth_users ADD COLUMN username_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (username_confirmed IN (0,1));
UPDATE auth_users SET username='user-'||id,username_key='user-'||lower(id);
CREATE UNIQUE INDEX idx_auth_users_username ON auth_users(username_key);
CREATE TABLE username_aliases (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO username_aliases(username_key,username,user_id) SELECT username_key,username,id FROM auth_users;
CREATE INDEX idx_username_aliases_user ON username_aliases(user_id);
