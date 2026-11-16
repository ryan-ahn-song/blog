import { handleAccount } from './account';
import { legal } from './legal';
import { pendingSignup, handleSignup } from './signup';
import { json, readBody, HttpError } from './http';
import { handleGoogle } from './google';
import { handleGitHub } from './github';
import { profileImageKey } from './media';
import { type AuthEnv, type UserRow, currentUser, requireUser, publicUser, checkOrigin, readCookie, cookie, digest } from './session';
export async function handleAuth(request: Request, env: AuthEnv & {MEDIA:R2Bucket;MEDIA_BASE_URL?:string}): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/google' || path === '/api/auth/callback/google') return handleGoogle(request, env);
  if(path==='/api/auth/github'||path==='/api/auth/callback/github')return handleGitHub(request,env);
  if(path==='/api/auth/signup')return handleSignup(request,env);
  if(path==='/api/auth/legal'&&request.method==='GET')return json(legal);
  if (request.method === 'GET' && path === '/api/auth/providers') return json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),github:Boolean(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET) });
  if (request.method === 'GET' && path === '/api/auth/me') {
    const user = await currentUser(request, env);
    const pending=user?null:await pendingSignup(request,env);
    return json({ user: user ? publicUser(user,request,env) : null, ...(pending?{signup:{name:pending.suggested_name,provider:pending.provider}}:{}) }, 200, user ? {} : { 'Set-Cookie': cookie(request, 'session', '', 0) });
  }
  if(path==='/api/auth/account'||/^\/api\/auth\/connections\/(google|github)$/.test(path))return handleAccount(request,env);
  if (path === '/api/auth/profile') {
    if (request.method !== 'PATCH') return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'PATCH'});
    checkOrigin(request);
    const actor = await requireUser(request,env);
    const body = await readBody(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length>80 || typeof body.bio !== 'string' || body.bio.length>160 || typeof body.version !== 'number' || !Number.isSafeInteger(body.version)) throw new HttpError(400,'이름(80자)과 소개(160자)를 확인해 주세요.');
    const images:{avatar_key:string|null;cover_key:string|null}={avatar_key:actor.avatar_key,cover_key:actor.cover_key};
    for(const field of ['avatar_key','cover_key'] as const){
      if(body[field]===undefined)continue;
      if(body[field]===null||body[field]===''){images[field]=null;continue;}
      const key=body[field];
      if(typeof key!=='string'||!profileImageKey.test(key))throw new HttpError(400,'프로필 이미지를 다시 업로드해 주세요.');
      if(key.split('/')[1]!==actor.id||!key.split('/')[2].startsWith(field==='avatar_key'?'avatar-':'cover-'))throw new HttpError(403,'본인의 프로필 이미지만 사용할 수 있습니다.');
      if(!await env.MEDIA.head(key))throw new HttpError(400,'프로필 이미지가 존재하지 않습니다.');
      images[field]=key;
    }
    const user = await env.DB.prepare('UPDATE auth_users SET name=?,bio=?,avatar_key=?,cover_key=?,version=version+1 WHERE id=? AND version=? RETURNING *').bind(body.name.trim(),body.bio.trim(),images.avatar_key,images.cover_key,actor.id,body.version).first<UserRow>();
    if (!user) throw new HttpError(409,'프로필이나 권한이 변경되었습니다. 프로필을 다시 열어 주세요.');
    return json({user:publicUser(user,request,env)});
  }
  if(path==='/api/auth/login')return json({error:'이메일 로그인은 종료되었습니다. Google 또는 GitHub로 로그인해 주세요.'},410);
  if(path!=='/api/auth/logout')throw new HttpError(404,'요청한 경로를 찾을 수 없습니다.');
  if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'POST'});
  checkOrigin(request);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(readCookie(request,'session'))).run();
  return json({user:null},200,{'Set-Cookie':cookie(request,'session','',0)});
}
