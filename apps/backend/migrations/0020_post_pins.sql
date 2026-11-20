CREATE TABLE post_pins (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  pinned_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  pinned_at INTEGER NOT NULL DEFAULT (unixepoch())
);
