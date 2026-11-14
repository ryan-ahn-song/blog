import { json, HttpError } from './http';
import type { AuthEnv } from './session';
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
  const rows = await env.DB.prepare("SELECT t.*, (SELECT count(*) FROM posts p WHERE p.status='published' AND EXISTS(SELECT 1 FROM json_each(p.topic_ids) j WHERE j.value=t.id)) AS post_count FROM topics t ORDER BY t.position,t.id").all<Topic>();
  return json({topics: rows.results});
}
export async function handleWriters(request: Request, env: AuthEnv) {
  if (request.method !== 'GET') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0,100), topic = params.get('topic'), category = params.get('category');
  if (category && !['all','tech','life'].includes(category)) throw new HttpError(400,'분류를 확인해 주세요.');
  const clauses = ["u.role IN ('author','admin')", 'u.disabled=0'];
  const values: string[] = [];
  if (q) { clauses.push("(instr(lower(u.name||' '||u.bio),lower(?))>0 OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND (instr(lower(p.title||' '||p.summary||' '||p.body),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(p.topic_ids) j JOIN topics t ON t.id=j.value WHERE instr(lower(t.name),lower(?))>0))))"); values.push(q,q,q); }
  if (topic && topic !== 'all') { clauses.push("EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND EXISTS(SELECT 1 FROM json_each(p.topic_ids) j WHERE j.value=?))"); values.push(topic); }
  if (category && category !== 'all') { clauses.push("EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published' AND p.category=?)"); values.push(category); }
  const page = Math.max(0,Math.min(100000,Number(params.get('page'))||0))|0;
  const where = ' WHERE '+clauses.join(' AND ');
  const rows = await env.DB.prepare("SELECT u.id,u.name,u.bio,(SELECT count(*) FROM posts p WHERE p.author_id=u.id AND p.status='published') AS post_count FROM auth_users u"+where+' ORDER BY post_count DESC,u.created_at,u.id LIMIT 100 OFFSET ?').bind(...values,page*100).all();
  const total = await env.DB.prepare('SELECT count(*) AS total FROM auth_users u'+where).bind(...values).first<{total:number}>();
  return json({writers:rows.results,total:total?.total??0,page});
}
