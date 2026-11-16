CREATE TABLE post_reads (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL CHECK(length(visitor_hash)=64),
  read_day TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 1 CHECK(views>0),
  PRIMARY KEY(post_id,visitor_hash,read_day)
);
CREATE INDEX post_reads_day ON post_reads(read_day,post_id,visitor_hash);
