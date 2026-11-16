import { randomBytes } from 'node:crypto';
import { json, readBody, HttpError } from './http';
import { type AuthEnv, checkOrigin, currentUser, requireUser, readCookie, cookie, digest, limited, now } from './session';

const day=(timestamp:number)=>new Date((timestamp+9*3600)*1000).toISOString().slice(0,10);
const midnight=(timestamp:number)=>Math.floor((timestamp+9*3600)/86400)*86400-9*3600;

export async function recordRead(request:Request,env:AuthEnv){
  if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'POST'});
  checkOrigin(request);await readBody(request,256);
  const id=new URL(request.url).pathname.match(/^\/api\/posts\/([\w-]+)\/view$/)?.[1];
  const post=await env.DB.prepare("SELECT p.id,p.author_id FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0").bind(id??'').first<{id:string;author_id:string}>();
  if(!post)throw new HttpError(404,'포스트를 찾을 수 없습니다.');
  const actor=await currentUser(request,env);
  if(actor?.id===post.author_id||request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||/bot|crawler|spider|preview/i.test(request.headers.get('User-Agent')??''))return json({recorded:false});
  const existing=readCookie(request,'visitor'),token=/^[a-f0-9]{64}$/.test(existing)?existing:randomBytes(32).toString('hex');
  const identity=digest(actor?'reader-account:'+actor.id:'reader-browser:'+token),time=now();
  if(await limited(env.DB,digest('read-limit:'+identity),120))throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  await env.DB.prepare("INSERT INTO post_reads(post_id,visitor_hash,read_day,first_seen,last_seen,views) SELECT p.id,?,?,?,?,1 FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0 AND p.author_id<>? ON CONFLICT(post_id,visitor_hash,read_day) DO UPDATE SET views=post_reads.views+CASE WHEN excluded.last_seen-post_reads.last_seen>=1800 THEN 1 ELSE 0 END,last_seen=max(post_reads.last_seen,excluded.last_seen)").bind(identity,day(time),time,time,post.id,actor?.id??'').run();
  return json({recorded:true},200,actor?{}:{'Set-Cookie':cookie(request,'visitor',token,30*86400)});
}

export async function authorDashboard(request:Request,env:AuthEnv){
  if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const actor=await requireUser(request,env,['author','admin']),params=new URL(request.url).searchParams;
  const days=Number(params.get('days')??28),status=params.get('status')??'all',sort=params.get('sort')??'updated',q=(params.get('q')??'').trim().slice(0,100);
  if(![7,28,90].includes(days)||!['all','draft','published'].includes(status)||!['updated','readers','bookmarks'].includes(sort))throw new HttpError(400,'조회 조건을 확인해 주세요.');
  const page=Math.max(0,Math.min(100000,Number(params.get('page'))||0))|0,time=now(),start=midnight(time)-(days-1)*86400,startDay=day(start),sparkStart=day(midnight(time)-13*86400);
  const counts=await env.DB.prepare("SELECT count(*) AS total,coalesce(sum(status='draft'),0) AS drafts,coalesce(sum(status='published'),0) AS published FROM posts WHERE author_id=?").bind(actor.id).first<{total:number;drafts:number;published:number}>();
  const engagement=await env.DB.prepare("SELECT (SELECT count(DISTINCT r.visitor_hash) FROM post_reads r JOIN posts p ON p.id=r.post_id WHERE p.author_id=? AND r.read_day>=?) AS readers,(SELECT coalesce(sum(r.views),0) FROM post_reads r JOIN posts p ON p.id=r.post_id WHERE p.author_id=? AND r.read_day>=?) AS views,(SELECT count(*) FROM post_bookmarks b JOIN posts p ON p.id=b.post_id JOIN auth_users u ON u.id=b.user_id WHERE p.author_id=? AND u.disabled=0) AS bookmarks,(SELECT count(*) FROM post_likes l JOIN posts p ON p.id=l.post_id JOIN auth_users u ON u.id=l.user_id WHERE p.author_id=? AND u.disabled=0) AS likes").bind(actor.id,startDay,actor.id,startDay,actor.id,actor.id).first<{readers:number;views:number;bookmarks:number;likes:number}>();
  const activity=await env.DB.prepare('SELECT r.read_day,count(DISTINCT r.visitor_hash) AS readers,sum(r.views) AS views FROM post_reads r JOIN posts p ON p.id=r.post_id WHERE p.author_id=? AND r.read_day>=? GROUP BY r.read_day ORDER BY r.read_day').bind(actor.id,startDay).all<{read_day:string;readers:number;views:number}>();
  const clauses=['p.author_id=?'],values:(string|number)[]=[actor.id];
  if(status!=='all'){clauses.push('p.status=?');values.push(status);}
  if(q){clauses.push('instr(lower(p.title),lower(?))>0');values.push(q);}
  const where=' WHERE '+clauses.join(' AND '),order={updated:'p.updated_at DESC,p.id',readers:'reader_count DESC,p.updated_at DESC,p.id',bookmarks:'bookmark_count DESC,p.updated_at DESC,p.id'}[sort];
  const posts=await env.DB.prepare("SELECT p.id,p.title,p.summary,p.category,p.status,p.updated_at,p.published_at,p.revision,(SELECT count(DISTINCT r.visitor_hash) FROM post_reads r WHERE r.post_id=p.id) AS reader_count,(SELECT coalesce(sum(r.views),0) FROM post_reads r WHERE r.post_id=p.id) AS view_count,(SELECT count(*) FROM post_bookmarks b JOIN auth_users u ON u.id=b.user_id WHERE b.post_id=p.id AND u.disabled=0) AS bookmark_count,(SELECT count(*) FROM post_likes l JOIN auth_users u ON u.id=l.user_id WHERE l.post_id=p.id AND u.disabled=0) AS like_count FROM posts p"+where+' ORDER BY '+order+' LIMIT 20 OFFSET ?').bind(...values,page*20).all<{id:string;title:string;status:string;reader_count:number;view_count:number;bookmark_count:number;like_count:number}>();
  const filtered=await env.DB.prepare('SELECT count(*) AS total FROM posts p'+where).bind(...values).first<{total:number}>();
  const ids=posts.results.map(post=>post.id);
  const trends=ids.length?await env.DB.prepare('SELECT r.post_id,r.read_day,count(DISTINCT r.visitor_hash) AS readers FROM post_reads r JOIN posts p ON p.id=r.post_id WHERE p.author_id=? AND r.read_day>=? AND r.post_id IN ('+ids.map(()=>'?').join(',')+') GROUP BY r.post_id,r.read_day').bind(actor.id,sparkStart,...ids).all<{post_id:string;read_day:string;readers:number}>():{results:[]};
  return json({owner_id:actor.id,days,page,total:filtered?.total??0,summary:{...counts,...engagement},series:Array.from({length:days},(_,i)=>{const date=day(start+i*86400),row=activity.results.find(row=>row.read_day===date);return {date,readers:row?.readers??0,views:row?.views??0};}),posts:posts.results.map(post=>({...post,daily_readers:Array.from({length:14},(_,i)=>trends.results.find(row=>row.post_id===post.id&&row.read_day===day(midnight(time)-(13-i)*86400))?.readers??0)})),generated_at:time});
}
