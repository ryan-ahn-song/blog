CREATE TABLE writer_subscriptions (
  subscriber_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  writer_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (subscriber_id,writer_id),
  CHECK (subscriber_id<>writer_id)
);
CREATE INDEX subscriptions_writer ON writer_subscriptions(writer_id);
