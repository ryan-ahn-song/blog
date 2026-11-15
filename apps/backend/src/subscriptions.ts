import { json, readBody, HttpError } from './http';
import { type AuthEnv, checkOrigin, requireUser, limited, digest } from './session';
import { mediaUrl } from './media';

type Env=AuthEnv&{MEDIA_BASE_URL?:string};
export async function handleSubscriptions(request:Request,env:Env){
  const path=new URL(request.url).pathname;
  if(path==='/api/subscriptions'){
    if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
    const actor=await requireUser(request,env);
    const rows=await env.DB.prepare("SELECT u.id,u.name,u.avatar_key,p.id AS post_id,p.title,p.published_at FROM writer_subscriptions s JOIN auth_users u ON u.id=s.writer_id LEFT JOIN posts p ON p.id=(SELECT latest.id FROM posts latest WHERE latest.author_id=u.id AND latest.status='published' ORDER BY latest.published_at DESC,latest.id LIMIT 1) WHERE s.subscriber_id=? AND u.disabled=0 ORDER BY (p.published_at IS NULL),p.published_at DESC,s.created_at DESC,u.id").bind(actor.id).all<{id:string;name:string;avatar_key:string|null;post_id:string|null;title:string|null;published_at:number|null}>();
    return json({writers:rows.results.map(row=>({id:row.id,name:row.name,avatar_url:mediaUrl(row.avatar_key,request,env),latest_post:row.post_id?{id:row.post_id,title:row.title,published_at:row.published_at}:null})),total:rows.results.length});
  }
  if(request.method!=='PUT')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'PUT'});
  checkOrigin(request);
  const actor=await requireUser(request,env),id=path.match(/^\/api\/writers\/([\w-]+)\/subscription$/)?.[1];
  if(!id)throw new HttpError(404,'필자를 찾을 수 없습니다.');
  if(id===actor.id)throw new HttpError(400,'본인의 프로필은 구독할 수 없습니다.');
  const body=await readBody(request);
  if(typeof body.active!=='boolean')throw new HttpError(400,'구독 상태를 확인해 주세요.');
  if(await limited(env.DB,digest('subscription:'+actor.id),60))throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  if(body.active){
    const target=await env.DB.prepare("SELECT id FROM auth_users u WHERE id=? AND disabled=0 AND (role IN ('author','admin') OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published'))").bind(id).first();
    if(!target)throw new HttpError(404,'필자를 찾을 수 없습니다.');
    await env.DB.prepare("INSERT INTO writer_subscriptions(subscriber_id,writer_id) SELECT ?,u.id FROM auth_users u WHERE u.id=? AND u.disabled=0 AND (u.role IN ('author','admin') OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published')) ON CONFLICT(subscriber_id,writer_id) DO NOTHING").bind(actor.id,id).run();
  }else await env.DB.prepare('DELETE FROM writer_subscriptions WHERE subscriber_id=? AND writer_id=?').bind(actor.id,id).run();
  const subscribed=Boolean(await env.DB.prepare('SELECT 1 FROM writer_subscriptions WHERE subscriber_id=? AND writer_id=?').bind(actor.id,id).first());
  return json({subscribed});
}
