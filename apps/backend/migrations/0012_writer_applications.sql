CREATE TABLE writer_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  introduction TEXT NOT NULL CHECK(length(introduction) BETWEEN 1 AND 1000),
  topic_ids TEXT NOT NULL CHECK(json_valid(topic_ids)),
  plan TEXT NOT NULL CHECK(length(plan) BETWEEN 1 AND 2000),
  portfolio_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  version INTEGER NOT NULL DEFAULT 1,
  consent_version TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  decision_token TEXT
);
CREATE UNIQUE INDEX writer_application_one_pending ON writer_applications(user_id) WHERE status='pending';
CREATE INDEX writer_application_review_queue ON writer_applications(status,created_at,id);
CREATE INDEX writer_application_user ON writer_applications(user_id,created_at,id);
