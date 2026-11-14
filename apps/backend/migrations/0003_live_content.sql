ALTER TABLE auth_users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN topic_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topic_ids));
UPDATE posts SET topic_ids=json_array(category);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tech','life')),
  color TEXT NOT NULL,
  symbol TEXT NOT NULL,
  position INTEGER NOT NULL
);
-- These are the blog's real taxonomy, not sample articles or accounts.
INSERT INTO topics(id,name,category,color,symbol,position) VALUES
  ('tech','개발 · 기술','tech','#123978','⌘',1),
  ('frontend','프론트엔드','tech','#503083','◈',2),
  ('backend','백엔드','tech','#074c55','⌥',3),
  ('infra','인프라','tech','#8b4810','☁',4),
  ('life','일상 · 에세이','life','#09634f','☕',5),
  ('essay','에세이','life','#8c164d','▤',6),
  ('record','작업 기록','tech','#6c2029','✎',7),
  ('inspiration','생각과 영감','life','#635006','✳',8);

CREATE TABLE post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (post_id,user_id)
);
CREATE TABLE post_bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (post_id,user_id)
);
CREATE INDEX bookmarks_user ON post_bookmarks(user_id,created_at DESC);
CREATE INDEX likes_user ON post_likes(user_id);
