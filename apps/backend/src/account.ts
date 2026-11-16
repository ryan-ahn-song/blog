import { randomUUID } from 'node:crypto';
import { json, readBody, HttpError } from './http';
import { type AuthEnv, requireUser, publicUser, checkOrigin, cookie, digest, limited, requireRecentAuth, createSession } from './session';
type Env=AuthEnv&{MEDIA:R2Bucket;MEDIA_BASE_URL?:string};
export async function accountData(actor:Awaited<ReturnType<typeof requireUser>>,request:Request,env:Env){
  const row=await env.DB.prepare('SELECT EXISTS(SELECT 1 FROM auth_google_accounts WHERE user_id=?) AS google,EXISTS(SELECT 1 FROM auth_github_accounts WHERE user_id=?) AS github').bind(actor.id,actor.id).first<{google:number;github:number}>();
  return {user:publicUser(actor,request,env),connections:{google:Boolean(row?.google),github:Boolean(row?.github)},google_available:Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),github_available:Boolean(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET)};
}
// R2 and D1 cannot share a transaction. Persist cleanup work before removing the account.
export async function cleanupAccountMedia(env:Env,onlyUser?:string){
  const rows=onlyUser?{results:[{user_id:onlyUser}]}:await env.DB.prepare('SELECT user_id FROM media_cleanup_jobs ORDER BY created_at LIMIT 5').all<{user_id:string}>();
  for(const {user_id} of rows.results){
    if(!/^[\w-]{1,100}$/.test(user_id))continue;
    try{
      let remaining=false;
      for(const prefix of ['posts/'+user_id+'/','profiles/'+user_id+'/']){
        const objects=await env.MEDIA.list({prefix,limit:500});
        if(objects.objects.length)await env.MEDIA.delete(objects.objects.map(object=>object.key));
        if((await env.MEDIA.list({prefix,limit:1})).objects.length)remaining=true;
      }
      if(!remaining)await env.DB.prepare('DELETE FROM media_cleanup_jobs WHERE user_id=?').bind(user_id).run();
    }catch{console.error('Account media cleanup will retry');}
  }
}
export async function handleAccount(request:Request,env:Env){
  const path=new URL(request.url).pathname,actor=await requireUser(request,env);
  if(path==='/api/auth/account'&&request.method==='GET')return json(await accountData(actor,request,env));
  if(request.method!=='DELETE')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:path==='/api/auth/account'?'GET, DELETE':'DELETE'});
  checkOrigin(request);
  if(await limited(env.DB,digest('account-controls:'+actor.id),20))throw new HttpError(429,'계정 변경 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const provider=path.match(/^\/api\/auth\/connections\/(google|github)$/)?.[1];
  if(provider){
    const connections=await accountData(actor,request,env);
    if(!connections.connections.google||!connections.connections.github)throw new HttpError(409,'로그인 수단은 최소 하나를 유지해야 합니다.');
    await requireRecentAuth(request,env,actor);
    const table=provider==='google'?'auth_google_accounts':'auth_github_accounts',other=provider==='google'?'auth_github_accounts':'auth_google_accounts',token=randomUUID();
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE auth_users SET login_version=login_version+1,account_change_token=? WHERE id=? AND login_version=? AND disabled=0 AND EXISTS(SELECT 1 FROM ${table} WHERE user_id=?) AND EXISTS(SELECT 1 FROM ${other} WHERE user_id=?)`).bind(token,actor.id,actor.login_version,actor.id,actor.id),
      env.DB.prepare(`DELETE FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM ${other} WHERE user_id=?) AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND account_change_token=?) RETURNING user_id`).bind(actor.id,actor.id,actor.id,token),
      env.DB.prepare('DELETE FROM auth_oauth_states WHERE link_user_id=? AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND account_change_token=?)').bind(actor.id,actor.id,token),
      env.DB.prepare('DELETE FROM auth_github_states WHERE link_user_id=? AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND account_change_token=?)').bind(actor.id,actor.id,token),
    ]);
    if(!results[1].results.length)throw new HttpError(409,'로그인 수단은 최소 하나를 유지해야 합니다. 연결 상태를 새로고침해 주세요.');
    const refreshed=await env.DB.prepare('SELECT * FROM auth_users WHERE id=?').bind(actor.id).first<typeof actor>();
    const session=await createSession(request,env,actor.id,refreshed!.login_version);
    await env.DB.prepare('UPDATE auth_sessions SET authenticated_at=0 WHERE user_id=?').bind(actor.id).run();
    await env.DB.prepare('INSERT INTO account_security_events(actor_hash,event) VALUES(?,?)').bind(digest(actor.id),'unlink:'+provider).run();
    return json(await accountData(refreshed!,request,env),200,{'Set-Cookie':session});
  }
  if(path!=='/api/auth/account')throw new HttpError(404,'요청한 경로를 찾을 수 없습니다.');
  const body=await readBody(request);
  if(typeof body.email!=='string'||body.email.trim().toLowerCase()!==actor.email.toLowerCase())throw new HttpError(400,'현재 계정의 로그인 이메일을 정확히 입력해 주세요.');
  await requireRecentAuth(request,env,actor);
  const token=randomUUID(),guard='SELECT id FROM auth_users WHERE id=? AND account_change_token=?';
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE auth_users SET account_change_token=? WHERE id=? AND email=? COLLATE NOCASE AND login_version=? AND disabled=0 AND (role!='admin' OR EXISTS(SELECT 1 FROM auth_users a WHERE a.id!=auth_users.id AND a.role='admin' AND a.disabled=0)) RETURNING id").bind(token,actor.id,actor.email,actor.login_version),
    env.DB.prepare('INSERT INTO media_cleanup_jobs(user_id) SELECT id FROM auth_users WHERE id=? AND account_change_token=? ON CONFLICT(user_id) DO NOTHING').bind(actor.id,token),
    env.DB.prepare('DELETE FROM auth_pending_signups WHERE email=? COLLATE NOCASE AND EXISTS('+guard+')').bind(actor.email,actor.id,token),
    env.DB.prepare('DELETE FROM auth_oauth_states WHERE link_user_id IN ('+guard+')').bind(actor.id,token),
    env.DB.prepare('DELETE FROM auth_login_limits WHERE key IN (?,?,?,?,?) AND EXISTS('+guard+')').bind(digest('comments:'+actor.id),digest('reaction:'+actor.id),digest('upload:'+actor.id),digest('writer-application:'+actor.id),digest('account-controls:'+actor.id),actor.id,token),
    env.DB.prepare('DELETE FROM post_reads WHERE visitor_hash=? AND EXISTS('+guard+')').bind(digest('reader-account:'+actor.id),actor.id,token),
    env.DB.prepare('DELETE FROM posts WHERE author_id IN ('+guard+')').bind(actor.id,token),
    env.DB.prepare('DELETE FROM auth_users WHERE id=? AND account_change_token=? RETURNING id').bind(actor.id,token),
  ]);
  if(!result[7].results.length)throw new HttpError(409,'마지막 활성 관리자 계정은 삭제할 수 없습니다. 다른 관리자를 지정한 후 다시 시도해 주세요.');
  await env.DB.prepare('INSERT INTO account_security_events(actor_hash,event) VALUES(?,?)').bind(digest(actor.id),'account-deleted').run();
  await cleanupAccountMedia(env,actor.id);
  const headers=new Headers();for(const suffix of ['session','signup','oauth','github_oauth'])headers.append('Set-Cookie',cookie(request,suffix,'',0));
  return json({user:null,deleted:true},200,headers);
}
