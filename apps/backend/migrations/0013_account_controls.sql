ALTER TABLE auth_users ADD COLUMN account_change_token TEXT;
ALTER TABLE auth_users ADD COLUMN login_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_oauth_states ADD COLUMN link_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_github_states ADD COLUMN link_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE media_cleanup_jobs (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
