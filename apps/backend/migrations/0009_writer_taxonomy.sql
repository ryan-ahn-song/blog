CREATE TABLE writer_labels (
  id TEXT PRIMARY KEY,
  writer_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('category','tag')),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  name_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT(unixepoch()),
  UNIQUE(writer_id,kind,name_key),
  UNIQUE(id,writer_id,kind)
);
CREATE INDEX writer_labels_writer ON writer_labels(writer_id,kind,created_at,id);
CREATE UNIQUE INDEX posts_id_author ON posts(id,author_id);
CREATE TABLE post_writer_labels (
  post_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  writer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('category','tag')),
  PRIMARY KEY(post_id,label_id),
  FOREIGN KEY(post_id,writer_id) REFERENCES posts(id,author_id) ON DELETE CASCADE,
  FOREIGN KEY(label_id,writer_id,kind) REFERENCES writer_labels(id,writer_id,kind) ON DELETE CASCADE
);
CREATE INDEX post_writer_labels_label ON post_writer_labels(label_id,post_id);
CREATE UNIQUE INDEX post_one_writer_category ON post_writer_labels(post_id) WHERE kind='category';
ALTER TABLE posts ADD COLUMN taxonomy_write_token TEXT;
