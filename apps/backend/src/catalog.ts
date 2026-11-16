import { json, HttpError } from './http';
import type { AuthEnv } from './session';
import { currentUser } from './session';
import { mediaUrl } from './media';
import { now } from './session';
export type Topic = {id: string; name: string; category: string; color: string; symbol: string; position: number; post_count?: number};
export async function topicsForPost(db: D1Database, category: string, input: unknown): Promise<string[]> {
  if (input !== undefined && (!Array.isArray(input) || input.length > 8 || input.some(id => typeof id !== 'string'))) throw new HttpError(400,'주제를 다시 선택해 주세요.');
  const ids = [...new Set([category, ...((input ?? []) as string[])])];
  const catalog = await db.prepare('SELECT id,category FROM topics').all<Topic>();
  if (ids.some(id => !catalog.results.some(t => t.id === id && t.category === category))) throw new HttpError(400,'분류에 맞는 주제를 선택해 주세요.');
  return ids;
}
export async function handleTopics(request: Request, env: AuthEnv) {
  if (request.method !== 'GET') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const rows = await env.DB.prepare("SELECT t.*, (SELECT count(*) FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.status='published' AND u.disabled=0 AND EXISTS(SELECT 1 FROM json_each(p.topic_ids) j WHERE j.value=t.id)) AS post_count FROM topics t ORDER BY t.position,t.id").all<Topic>();
  return json({topics: rows.results},200,{'Cache-Control':'public, max-age=60'});
}
export async function handleTrending(request:Request,env:AuthEnv){
  if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const today=new Date((now()+9*3600)*1000).toISOString().slice(0,10),start=new Date((now()+9*3600-6*86400)*1000).toISOString().slice(0,10);
  const rows=await env.DB.prepare("SELECT p.id,p.title,p.summary,u.id AS writer_id,u.name AS writer_name,r.view_count FROM posts p JOIN auth_users u ON u.id=p.author_id JOIN (SELECT post_id,sum(views) AS view_count FROM post_reads WHERE read_day>=? AND read_day<=? GROUP BY post_id) r ON r.post_id=p.id WHERE p.status='published' AND u.disabled=0 ORDER BY r.view_count DESC,p.published_at DESC,p.id LIMIT 4").bind(start,today).all<{id:string;title:string;summary:string;writer_id:string;writer_name:string;view_count:number}>();
  return json({posts:rows.results.map(({writer_id,writer_name,...post})=>({...post,writer:{id:writer_id,name:writer_name}})),period_days:7},200,{'Cache-Control':'public, max-age=30'});
}
type WriterRow={id:string;name:string;bio:string;avatar_key:string|null;cover_key:string|null;post_count:number};
function writerData(writer:WriterRow,request:Request,env:{MEDIA_BASE_URL?:string}){
  return {id:writer.id,name:writer.name,bio:writer.bio,post_count:writer.post_count,avatar_url:mediaUrl(writer.avatar_key,request,env),cover_url:mediaUrl(writer.cover_key,request,env)};
}
export async function handleWriters(request: Request, env: AuthEnv & {MEDIA_BASE_URL?:string}) {
  if (request.method !== 'GET') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const writerId=new URL(request.url).pathname.match(/^\/api\/writers\/([\w-]+)$/)?.[1];
  if(writerId){
    const actor=await currentUser(request,env);
    const writer=await env.DB.prepare("SELECT u.id,u.name,u.bio,u.avatar_key,u.cover_key,(SELECT count(*) FROM posts p WHERE p.author_id=u.id AND p.status='published') AS post_count FROM auth_users u WHERE u.id=? AND u.disabled=0 AND (u.role IN ('author','admin') OR u.id=? OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published'))").bind(writerId,actor?.id??'').first<WriterRow>();
    if(!writer)throw new HttpError(404,'필자 프로필을 찾을 수 없습니다.');
    const subscribed=actor?Boolean(await env.DB.prepare('SELECT 1 FROM writer_subscriptions WHERE subscriber_id=? AND writer_id=?').bind(actor.id,writerId).first()):false;
    const reads=await env.DB.prepare("SELECT coalesce(sum(r.views),0) AS total_views FROM post_reads r JOIN posts p ON p.id=r.post_id WHERE p.author_id=? AND p.status='published'").bind(writerId).first<{total_views:number}>();
    return json({writer:{...writerData(writer,request,env),subscribed,total_views:reads?.total_views??0}});
  }
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0,100), topic = params.get('topic'), category = params.get('category');
  if (category && !['all','tech','life'].includes(category)) throw new HttpError(400,'분류를 확인해 주세요.');
  const clauses = ["u.role IN ('author','admin')", 'u.disabled=0'];
  const values: string[] = [];
  if (q) { clauses.push("(instr(lower(u.name||' '||u.bio),lower(?))>0 OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND (instr(lower(p.title||' '||p.summary||' '||p.body),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(p.topic_ids) j JOIN topics t ON t.id=j.value WHERE instr(lower(t.name),lower(?))>0) OR EXISTS(SELECT 1 FROM post_writer_labels pl JOIN writer_labels l ON l.id=pl.label_id WHERE pl.post_id=p.id AND instr(lower(l.name),lower(?))>0))))"); values.push(q,q,q,q); }
  if (topic && topic !== 'all') { clauses.push("EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND EXISTS(SELECT 1 FROM json_each(p.topic_ids) j WHERE j.value=?))"); values.push(topic); }
  if (category && category !== 'all') { clauses.push("EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND p.category=?)"); values.push(category); }
  const page = Math.max(0,Math.min(100000,Number(params.get('page'))||0))|0;
  const where = ' WHERE '+clauses.join(' AND ');
  const rows = await env.DB.prepare("SELECT u.id,u.name,u.bio,u.avatar_key,u.cover_key,(SELECT count(*) FROM posts p WHERE p.author_id=u.id AND p.status='published') AS post_count FROM auth_users u"+where+' ORDER BY post_count DESC,u.created_at,u.id LIMIT 100 OFFSET ?').bind(...values,page*100).all<WriterRow>();
  const total = await env.DB.prepare('SELECT count(*) AS total FROM auth_users u'+where).bind(...values).first<{total:number}>();
  return json({writers:rows.results.map(w=>writerData(w,request,env)),total:total?.total??0,page});
}
