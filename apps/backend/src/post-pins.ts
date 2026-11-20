import {json,readBody,HttpError} from './http';
import {checkOrigin,requireUser,limited,digest,type AuthEnv} from './session';

// Editorial placement affects the public site, so only web administrators may change it.
export async function handlePostPin(request:Request,env:AuthEnv){
  if(request.method!=='PUT')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'PUT'});
  checkOrigin(request);
  const actor=await requireUser(request,env,['admin']);
  const id=new URL(request.url).pathname.match(/^\/api\/posts\/([\w-]+)\/pin$/)![1];
  const body=await readBody(request);
  if(typeof body.active!=='boolean')throw new HttpError(400,'고정 상태를 확인해 주세요.');
  if(await limited(env.DB,digest('post-pin:'+actor.id),60))throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const post=await env.DB.prepare('SELECT p.status,p.kind,u.disabled FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=?').bind(id).first<{status:string;kind:string;disabled:number}>();
  if(!post)throw new HttpError(404,'포스트를 찾을 수 없습니다.');
  if(body.active){
    if(post.status!=='published'||post.kind!=='post'||post.disabled)throw new HttpError(400,'공개된 일반 포스트만 고정할 수 있습니다.');
    // The capacity and visibility checks live in the write itself to avoid concurrent overbooking.
    const result=await env.DB.prepare("INSERT INTO post_pins(post_id,pinned_by) SELECT p.id,? FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND p.kind='post' AND u.disabled=0 AND ((SELECT count(*) FROM post_pins)<3 OR EXISTS(SELECT 1 FROM post_pins WHERE post_id=p.id)) ON CONFLICT(post_id) DO UPDATE SET post_id=excluded.post_id RETURNING post_id").bind(actor.id,id).first();
    if(!result)throw new HttpError(409,'포스트는 최대 3개까지 고정할 수 있습니다. 기존 고정을 해제한 뒤 다시 시도해 주세요.');
  }else await env.DB.prepare('DELETE FROM post_pins WHERE post_id=?').bind(id).run();
  return json({post:{id,pinned:body.active}});
}
