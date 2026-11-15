ALTER TABLE posts ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain' CHECK(body_format IN ('plain','markdown'));
ALTER TABLE posts ADD COLUMN body_doc TEXT CHECK(body_doc IS NULL OR json_valid(body_doc));
