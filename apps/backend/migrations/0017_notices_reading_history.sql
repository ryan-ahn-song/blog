ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post','notice'));
CREATE INDEX idx_posts_author_kind_published ON posts(author_id,kind,status,published_at DESC,id);
CREATE TABLE reading_history (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  read_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id,post_id)
);
CREATE INDEX idx_reading_history_recent ON reading_history(user_id,read_at DESC,post_id);
CREATE INDEX idx_reading_history_expiry ON reading_history(read_at);
