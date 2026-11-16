-- Existing sessions must reauthenticate before sensitive account changes.
ALTER TABLE auth_sessions ADD COLUMN login_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_sessions ADD COLUMN authenticated_at INTEGER NOT NULL DEFAULT 0;
DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE login_version>0);
UPDATE auth_sessions SET login_version=(SELECT login_version FROM auth_users WHERE id=auth_sessions.user_id);
ALTER TABLE auth_oauth_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'link';
ALTER TABLE auth_github_states ADD COLUMN purpose TEXT NOT NULL DEFAULT 'link';
CREATE INDEX auth_login_limits_expiry ON auth_login_limits(expires_at);
CREATE INDEX auth_pending_signups_expiry ON auth_pending_signups(expires_at);
CREATE INDEX posts_author_public ON posts(author_id,status,published_at DESC,id);
CREATE INDEX post_reads_post_day ON post_reads(post_id,read_day,visitor_hash);
CREATE TABLE account_security_events(id INTEGER PRIMARY KEY, actor_hash TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TABLE media_uploads(key TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, bytes INTEGER NOT NULL CHECK(bytes>=0), created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE INDEX media_uploads_owner ON media_uploads(user_id,created_at);
CREATE TABLE media_inventory(user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE);

CREATE INDEX account_security_events_expiry ON account_security_events(created_at);
