ALTER TABLE auth_sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
UPDATE auth_sessions SET last_seen=unixepoch();
