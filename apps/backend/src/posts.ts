import { randomUUID } from 'node:crypto';
import { json, readBody, HttpError } from './http';
import { type AuthEnv, requireUser, checkOrigin, currentUser, now, limited, digest, local } from './session';
type Env = AuthEnv & { MEDIA: R2Bucket; MEDIA_BASE_URL?: string };
type PostRow = { id: string; author_id: string; author_name: string; title: string; summary: string; body: string; category: string; image_key: string | null; status: string; revision: number; created_at: number; updated_at: number; published_at: number | null };
const select = 'SELECT p.*,u.name AS author_name FROM posts p JOIN auth_users u ON u.id=p.author_id';
function imageUrl(key: string, request: Request, env: Env) { return (local(request) ? '/api/media' : env.MEDIA_BASE_URL) + '/' + key; }
function publicPost(p: PostRow, env: Env, request: Request) { return { ...p, writer: { id: p.author_id, name: p.author_name }, image: p.image_key ? imageUrl(p.image_key, request, env) : null }; }
export async function handlePosts(request: Request, env: Env) {
  const url = new URL(request.url), id = url.pathname.match(/^\/api\/posts\/([\w-]+)$/)?.[1];
  if (request.method === 'GET') {
    if (id) {
      const p = await env.DB.prepare(select + ' WHERE p.id=?').bind(id).first<PostRow>();
      if (!p) throw new HttpError(404, '글을 찾을 수 없습니다.');
      if (p.status !== 'published') {
        const user = await currentUser(request, env);
        if (!user || (user.id !== p.author_id && user.role !== 'admin')) throw new HttpError(404, '글을 찾을 수 없습니다.');
      }
      return json({ post: publicPost(p, env, request) });
    }
    const page = Math.max(0, Math.min(100000, Number(url.searchParams.get('page')) || 0)) | 0;
    const mine = url.searchParams.get('mine') === '1';
    const user = mine ? await requireUser(request, env, ['author', 'admin']) : null;
    const where = mine ? ' WHERE p.author_id=?' : " WHERE p.status='published'";
    const values = user ? [user.id] : [];
    const rows = await env.DB.prepare(select + where + ' ORDER BY ' + (mine ? 'p.updated_at' : 'p.published_at') + ' DESC,p.id LIMIT 20 OFFSET ?').bind(...values, page * 20).all<PostRow>();
    const total = await env.DB.prepare('SELECT count(*) AS total FROM posts p' + where).bind(...values).first<{total: number}>();
    return json({ posts: rows.results.map(p => publicPost(p, env, request)), total: total?.total ?? 0, page });
  }
  if (!['POST', 'PUT'].includes(request.method) || (request.method === 'POST' && id) || (request.method === 'PUT' && !id)) return json({error:'지원하지 않는 요청입니다.'},405);
  checkOrigin(request);
  const user = await requireUser(request, env, ['author', 'admin']);
  if (await limited(env.DB, digest('write:' + user.id), 100)) throw new HttpError(429, '저장 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const b = await readBody(request, 350000);
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 160 || typeof b.body !== 'string' || !b.body.trim() || b.body.length > 80000 || typeof b.summary !== 'string' || b.summary.length > 280 || !['tech','life'].includes(String(b.category)) || !['draft','published'].includes(String(b.status))) throw new HttpError(400, '제목(160자), 소개(280자), 본문(80,000자)을 확인해 주세요.');
  let imageKey: string | null = null;
  if (b.image_key !== null && b.image_key !== undefined && b.image_key !== '') {
    if (typeof b.image_key !== 'string' || !/^posts\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/.test(b.image_key)) throw new HttpError(400, '대표 이미지를 다시 업로드해 주세요.');
    const owner = b.image_key.split('/')[1];
    if (owner !== user.id && user.role !== 'admin') throw new HttpError(403, '본인이 업로드한 이미지를 사용해 주세요.');
    if (!await env.MEDIA.head(b.image_key)) throw new HttpError(400, '대표 이미지가 존재하지 않습니다.');
    imageKey = b.image_key;
  }
  let p: PostRow | null;
  if (!id) {
    const postId = randomUUID();
    await env.DB.prepare('INSERT INTO posts(id,author_id,title,summary,body,category,image_key,status,published_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(postId, user.id, b.title.trim(), b.summary.trim(), b.body, b.category, imageKey, b.status, b.status === 'published' ? now() : null).run();
    p = await env.DB.prepare(select + ' WHERE p.id=?').bind(postId).first<PostRow>();
  } else {
    const existing = await env.DB.prepare(select + ' WHERE p.id=?').bind(id).first<PostRow>();
    if (!existing) throw new HttpError(404, '글을 찾을 수 없습니다.');
    if (existing.author_id !== user.id && user.role !== 'admin') throw new HttpError(403, '본인의 글만 수정할 수 있습니다.');
    // Admins may edit another author's post without replacing its existing image.
    if (typeof b.revision !== 'number' || !Number.isSafeInteger(b.revision)) throw new HttpError(400, '글 버전을 확인해 주세요.');
    const updated = await env.DB.prepare('UPDATE posts SET title=?,summary=?,body=?,category=?,image_key=?,status=?,updated_at=?,published_at=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id').bind(b.title.trim(), b.summary.trim(), b.body, b.category, imageKey, b.status, now(), b.status === 'published' ? existing.published_at ?? now() : existing.published_at, id, b.revision).first();
    if (!updated) throw new HttpError(409, '다른 창에서 수정한 글입니다. 내용을 복사해 둔 뒤 다시 열어 주세요.');
    p = await env.DB.prepare(select + ' WHERE p.id=?').bind(id).first<PostRow>();
  }
  return json({post:p ? publicPost(p, env, request) : null}, id ? 200 : 201);
}
export async function handleMedia(request: Request, env: Env) {
  if (request.method === 'GET' && new URL(request.url).pathname.startsWith('/api/media/')) {
    const key = new URL(request.url).pathname.slice('/api/media/'.length);
    if (!/^posts\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/.test(key)) throw new HttpError(404,'이미지를 찾을 수 없습니다.');
    const object = await env.MEDIA.get(key);
    if (!object) throw new HttpError(404,'이미지를 찾을 수 없습니다.');
    const headers = new Headers({'X-Content-Type-Options':'nosniff'}); object.writeHttpMetadata(headers); headers.set('ETag',object.httpEtag);
    return new Response(object.body,{headers});
  }
  if (request.method !== 'POST') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'POST'});
  checkOrigin(request);
  const user = await requireUser(request, env, ['author', 'admin']);
  if (await limited(env.DB, digest('upload:' + user.id), 30)) throw new HttpError(429, '이미지 업로드가 많습니다. 잠시 후 다시 시도해 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '이미지를 선택해 주세요.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if(size > 8 * 1024 * 1024) { await reader.cancel(); throw new HttpError(413,'이미지는 8MB 이하로 올려 주세요.'); } chunks.push(value); }
  const data = new Uint8Array(size); let offset = 0; for(const chunk of chunks) { data.set(chunk,offset); offset+=chunk.byteLength; }
  const type = request.headers.get('Content-Type')?.split(';')[0];
  const png = data.length > 8 && [137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v);
  const jpg = data.length > 3 && data[0]===255 && data[1]===216 && data[2]===255;
  const webp = data.length > 12 && new TextDecoder().decode(data.slice(0,4))==='RIFF' && new TextDecoder().decode(data.slice(8,12))==='WEBP';
  const ext = type==='image/png' && png ? 'png' : type==='image/jpeg' && jpg ? 'jpg' : type==='image/webp' && webp ? 'webp' : null;
  if (!ext) throw new HttpError(415, 'JPG, PNG, WebP 이미지만 올릴 수 있습니다.');
  const key = 'posts/' + user.id + '/' + randomUUID() + '.' + ext;
  await env.MEDIA.put(key,data,{httpMetadata:{contentType:type!,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{author:user.id}});
  return json({key,url:imageUrl(key,request,env)},201);
}
