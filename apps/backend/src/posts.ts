import { randomUUID } from 'node:crypto';
import { json, readBody, HttpError } from './http';
import { type AuthEnv, requireUser, checkOrigin, currentUser, now, limited, digest, local } from './session';
import { topicsForPost } from './catalog';
import { mediaUrl,postImageKey,profileImageKey,inlineImageKey } from './media';
import { documentFields } from './document';
type Env = AuthEnv & { MEDIA: R2Bucket; MEDIA_BASE_URL?: string };
type PostRow = { id: string; author_id: string; author_name: string; author_bio: string; author_avatar_key:string|null; title: string; summary: string; body: string; body_format:'plain'|'markdown';body_doc:string|null; category: string; topic_ids: string; image_key: string | null; status: string; revision: number; created_at: number; updated_at: number; published_at: number | null; like_count:number; liked:number; saved:number };
const select = "SELECT p.*,u.name AS author_name,u.bio AS author_bio,u.avatar_key AS author_avatar_key,(SELECT count(*) FROM post_likes l JOIN auth_users a ON a.id=l.user_id WHERE l.post_id=p.id AND a.disabled=0) AS like_count,EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=?) AS liked,EXISTS(SELECT 1 FROM post_bookmarks b WHERE b.post_id=p.id AND b.user_id=?) AS saved FROM posts p JOIN auth_users u ON u.id=p.author_id";
function imageUrl(key: string, request: Request, env: Env) { return (local(request) ? '/api/media' : env.MEDIA_BASE_URL) + '/' + key; }
function publicPost(p: PostRow, env: Env, request: Request) { return { ...p, body_doc:p.body_doc?JSON.parse(p.body_doc):null, topic_ids:JSON.parse(p.topic_ids),liked:Boolean(p.liked),saved:Boolean(p.saved),writer: { id: p.author_id, name: p.author_name, bio:p.author_bio,avatar_url:mediaUrl(p.author_avatar_key,request,env) }, image: p.image_key ? imageUrl(p.image_key, request, env) : null }; }
async function validateBodyImages(body:Record<string,unknown>,request:Request,env:Env,user:{id:string;role:string}){
  const keys=new Set<string>();
  type ImageBlock={type:string;props?:{url?:string};children?:ImageBlock[]};
  function visit(blocks:ImageBlock[]){
    for(const block of blocks){
      if(block.type==='image'&&block.props?.url){
        const original=block.props.url,key=inlineImageKey(original,request,env);
        if(key){
          if(key.split('/')[1]!==user.id&&user.role!=='admin')throw new HttpError(403,'본인이 업로드한 본문 이미지를 사용해 주세요.');
          keys.add(key);
          const source='/api/media/'+key;
          if(original!==source){
            block.props.url=source;
            const escaped=original.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            body.body=(body.body as string).replace(new RegExp('(!\\[[^\\n]*?\\]\\()'+escaped+'(?=[)\\s])','g'),(_,prefix)=>prefix+source);
          }
        }
      }
      if(block.children)visit(block.children);
    }
  }
  if(Array.isArray(body.body_doc))visit(body.body_doc as ImageBlock[]);
  if(keys.size>50)throw new HttpError(400,'본문 이미지는 글 하나에 50개까지 사용할 수 있습니다.');
  const objects=await Promise.all([...keys].map(key=>env.MEDIA.head(key)));
  if(objects.some(object=>!object))throw new HttpError(400,'본문 이미지가 존재하지 않습니다. 다시 업로드해 주세요.');
}
export async function handlePosts(request: Request, env: Env) {
  const url = new URL(request.url), id = url.pathname.match(/^\/api\/posts\/([\w-]+)$/)?.[1];
  if (request.method === 'GET') {
    const actor=await currentUser(request,env), actorId=actor?.id??'';
    if (id) {
      const p = await env.DB.prepare(select + ' WHERE p.id=?').bind(actorId,actorId,id).first<PostRow>();
      if (!p) throw new HttpError(404, '글을 찾을 수 없습니다.');
      if (p.status !== 'published') {
        if (!actor || (actor.id !== p.author_id && actor.role !== 'admin')) throw new HttpError(404, '글을 찾을 수 없습니다.');
      }
      return json({ post: publicPost(p, env, request) });
    }
    const page = Math.max(0, Math.min(100000, Number(url.searchParams.get('page')) || 0)) | 0;
    const mine = url.searchParams.get('mine') === '1';
    const bookmarked=url.searchParams.get('bookmarked')==='1';
    const subscribed=url.searchParams.get('subscribed')==='1';
    if (mine) await requireUser(request,env,['author','admin']);
    if (bookmarked&&!actor) throw new HttpError(401,'저장한 글을 보려면 로그인해 주세요.');
    if(subscribed&&!actor)throw new HttpError(401,'구독한 글을 보려면 로그인해 주세요.');
    const clauses:string[]=[], values:(string|number)[]=[];
    if(mine){clauses.push('p.author_id=?');values.push(actorId);}else clauses.push("p.status='published'");
    if(bookmarked){clauses.push('EXISTS(SELECT 1 FROM post_bookmarks b WHERE b.post_id=p.id AND b.user_id=?)');values.push(actorId);}
    if(subscribed){clauses.push("u.disabled=0 AND EXISTS(SELECT 1 FROM writer_subscriptions s WHERE s.writer_id=p.author_id AND s.subscriber_id=?)");values.push(actorId);}
    const category=url.searchParams.get('category'),topic=url.searchParams.get('topic'),author=url.searchParams.get('author'),q=(url.searchParams.get('q')??'').trim().slice(0,100);
    if(category&&category!=='all'){if(!['tech','life'].includes(category))throw new HttpError(400,'분류를 확인해 주세요.');clauses.push('p.category=?');values.push(category);}
    if(topic&&topic!=='all'){clauses.push('EXISTS(SELECT 1 FROM json_each(p.topic_ids) j WHERE j.value=?)');values.push(topic);}
    if(author){clauses.push('p.author_id=?');values.push(author.slice(0,100));}
    if(q){clauses.push("(instr(lower(p.title||' '||p.summary||' '||p.body||' '||u.name),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(p.topic_ids) j JOIN topics t ON t.id=j.value WHERE instr(lower(t.name),lower(?))>0))");values.push(q,q);}
    const where=' WHERE '+clauses.join(' AND ');
    const rows = await env.DB.prepare(select + where + ' ORDER BY ' + (mine ? 'p.updated_at' : 'p.published_at') + ' DESC,p.id LIMIT 20 OFFSET ?').bind(actorId,actorId,...values, page * 20).all<PostRow>();
    const total = await env.DB.prepare('SELECT count(*) AS total FROM posts p JOIN auth_users u ON u.id=p.author_id' + where).bind(...values).first<{total: number}>();
    return json({ posts: rows.results.map(p => publicPost(p, env, request)), total: total?.total ?? 0, page });
  }
  if (!['POST', 'PUT'].includes(request.method) || (request.method === 'POST' && id) || (request.method === 'PUT' && !id)) return json({error:'지원하지 않는 요청입니다.'},405);
  checkOrigin(request);
  const user = await requireUser(request, env, ['author', 'admin']);
  if (await limited(env.DB, digest('write:' + user.id), 100)) throw new HttpError(429, '저장 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const b = await readBody(request, 1500000);
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 160 || typeof b.body !== 'string' || !b.body.trim() || b.body.length > 80000 || typeof b.summary !== 'string' || b.summary.length > 280 || typeof b.category!=='string' || !['tech','life'].includes(b.category) || typeof b.status!=='string' || !['draft','published'].includes(b.status)) throw new HttpError(400, '제목(160자), 소개(280자), 본문(80,000자)을 확인해 주세요.');
  const document=documentFields(b);
  await validateBodyImages(b,request,env,user);
  if(document.document)document.document=JSON.stringify(b.body_doc);
  const topicIds=await topicsForPost(env.DB,b.category,b.topic_ids);
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
    await env.DB.prepare('INSERT INTO posts(id,author_id,title,summary,body,category,image_key,status,published_at,topic_ids,body_format,body_doc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(postId, user.id, b.title.trim(), b.summary.trim(), b.body, b.category, imageKey, b.status, b.status === 'published' ? now() : null,JSON.stringify(topicIds),document.format,document.document).run();
    p = await env.DB.prepare(select + ' WHERE p.id=?').bind(user.id,user.id,postId).first<PostRow>();
  } else {
    const existing = await env.DB.prepare(select + ' WHERE p.id=?').bind(user.id,user.id,id).first<PostRow>();
    if (!existing) throw new HttpError(404, '글을 찾을 수 없습니다.');
    if (existing.author_id !== user.id && user.role !== 'admin') throw new HttpError(403, '본인의 글만 수정할 수 있습니다.');
    // Admins may edit another author's post without replacing its existing image.
    if (typeof b.revision !== 'number' || !Number.isSafeInteger(b.revision)) throw new HttpError(400, '글 버전을 확인해 주세요.');
    const updated = await env.DB.prepare('UPDATE posts SET title=?,summary=?,body=?,category=?,image_key=?,status=?,updated_at=?,published_at=?,topic_ids=?,body_format=?,body_doc=?,revision=revision+1 WHERE id=? AND revision=? RETURNING id').bind(b.title.trim(), b.summary.trim(), b.body, b.category, imageKey, b.status, now(), b.status === 'published' ? existing.published_at ?? now() : existing.published_at,JSON.stringify(topicIds),document.format,document.document, id, b.revision).first();
    if (!updated) throw new HttpError(409, '다른 창에서 수정한 글입니다. 내용을 복사해 둔 뒤 다시 열어 주세요.');
    p = await env.DB.prepare(select + ' WHERE p.id=?').bind(user.id,user.id,id).first<PostRow>();
  }
  return json({post:p ? publicPost(p, env, request) : null}, id ? 200 : 201);
}
export async function handleReaction(request:Request,env:Env){
  if(request.method!=='PUT')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'PUT'});
  checkOrigin(request);
  const actor=await requireUser(request,env);
  const match=new URL(request.url).pathname.match(/^\/api\/posts\/([\w-]+)\/(like|bookmark)$/)!;
  const body=await readBody(request);
  if(typeof body.active!=='boolean')throw new HttpError(400,'좋아요 또는 저장 상태를 확인해 주세요.');
  if(await limited(env.DB,digest('reaction:'+actor.id),120))throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const visible=await env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published'").bind(match[1]).first();
  if(!visible)throw new HttpError(404,'글을 찾을 수 없습니다.');
  const table=match[2]==='like'?'post_likes':'post_bookmarks';
  if(body.active)await env.DB.prepare('INSERT INTO '+table+"(post_id,user_id) SELECT id,? FROM posts WHERE id=? AND status='published' ON CONFLICT(post_id,user_id) DO NOTHING").bind(actor.id,match[1]).run();
  else await env.DB.prepare('DELETE FROM '+table+' WHERE post_id=? AND user_id=?').bind(match[1],actor.id).run();
  const post=await env.DB.prepare(select+" WHERE p.id=? AND p.status='published'").bind(actor.id,actor.id,match[1]).first<PostRow>();
  if(!post)throw new HttpError(404,'글을 찾을 수 없습니다.');
  return json({post:{id:post.id,like_count:post.like_count,liked:Boolean(post.liked),saved:Boolean(post.saved)}});
}
export async function handleMedia(request: Request, env: Env) {
  if (request.method === 'GET' && new URL(request.url).pathname.startsWith('/api/media/')) {
    const key = new URL(request.url).pathname.slice('/api/media/'.length);
    if (!postImageKey.test(key)&&!profileImageKey.test(key)) throw new HttpError(404,'이미지를 찾을 수 없습니다.');
    if(!local(request)&&env.MEDIA_BASE_URL){
      if(!await env.MEDIA.head(key))throw new HttpError(404,'이미지를 찾을 수 없습니다.');
      return new Response(null,{status:302,headers:{Location:imageUrl(key,request,env),'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
    }
    const object = await env.MEDIA.get(key);
    if (!object) throw new HttpError(404,'이미지를 찾을 수 없습니다.');
    const headers = new Headers({'X-Content-Type-Options':'nosniff'}); object.writeHttpMetadata(headers); headers.set('ETag',object.httpEtag);
    return new Response(object.body,{headers});
  }
  if (request.method !== 'POST') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'POST'});
  checkOrigin(request);
  const purpose=new URL(request.url).searchParams.get('purpose')??'post';
  if(!['post','avatar','cover'].includes(purpose))throw new HttpError(400,'업로드할 이미지 종류를 확인해 주세요.');
  const user = await requireUser(request, env, purpose==='post'?['author','admin']:['reader','author','admin']);
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
  const key = (purpose==='post'?'posts/'+user.id+'/':'profiles/'+user.id+'/'+purpose+'-')+randomUUID()+'.'+ext;
  await env.MEDIA.put(key,data,{httpMetadata:{contentType:type!,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{author:user.id}});
  return json({key,url:imageUrl(key,request,env),source:'/api/media/'+key},201);
}
