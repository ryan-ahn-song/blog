import {HttpError,json,readBody} from './http';
import {type AuthEnv,requireUser,checkOrigin,limited,digest} from './session';

export async function handleReadingHistory(request:Request,env:AuthEnv){
  if(!['GET','POST'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET, POST'});
  if(request.method==='POST')checkOrigin(request);
  const actor=await requireUser(request,env);
  if(request.method==='GET'){
    const rows=await env.DB.prepare("SELECT p.id,p.title,p.summary,p.kind,h.read_at FROM reading_history h JOIN posts p ON p.id=h.post_id JOIN auth_users u ON u.id=p.author_id WHERE h.user_id=? AND h.read_at>unixepoch()-7776000 AND p.status='published' AND u.disabled=0 ORDER BY h.read_at DESC,h.post_id LIMIT 4").bind(actor.id).all();
    return json({posts:rows.results});
  }
  const body=await readBody(request,256);
  if(typeof body.post_id!=='string'||!/^[\w-]{1,100}$/.test(body.post_id))throw new HttpError(400,'포스트를 확인해 주세요.');
  if(await limited(env.DB,digest('history:'+actor.id),120))throw new HttpError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const post=await env.DB.prepare("SELECT p.id FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0").bind(body.post_id).first();
  if(!post)throw new HttpError(404,'포스트를 찾을 수 없습니다.');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO reading_history(user_id,post_id,read_at) SELECT ?,p.id,unixepoch() FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0 ON CONFLICT(user_id,post_id) DO UPDATE SET read_at=max(reading_history.read_at,excluded.read_at)").bind(actor.id,body.post_id),
    env.DB.prepare('DELETE FROM reading_history WHERE user_id=? AND post_id NOT IN (SELECT post_id FROM reading_history WHERE user_id=? ORDER BY read_at DESC,post_id LIMIT 50)').bind(actor.id,actor.id),
  ]);
  return json({recorded:true});
}
