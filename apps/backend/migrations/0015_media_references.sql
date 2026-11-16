CREATE TABLE post_media (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 media_key TEXT NOT NULL,
 PRIMARY KEY(post_id,media_key)
);
CREATE INDEX post_media_key ON post_media(media_key,post_id);
CREATE INDEX auth_users_avatar ON auth_users(avatar_key) WHERE avatar_key IS NOT NULL;
CREATE INDEX auth_users_cover ON auth_users(cover_key) WHERE cover_key IS NOT NULL;
INSERT OR IGNORE INTO post_media(post_id,media_key) SELECT id,image_key FROM posts WHERE image_key IS NOT NULL;
INSERT OR IGNORE INTO post_media(post_id,media_key)
 SELECT p.id,substr(j.value,instr(j.value,'posts/')) FROM posts p,json_tree(p.body_doc) j
 WHERE j.key='url' AND j.type='text' AND instr(j.value,'posts/')>0 AND (j.value LIKE '/api/media/posts/%' OR j.value LIKE 'https://media.21stark.dev/posts/%');
