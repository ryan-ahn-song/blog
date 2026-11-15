import { verifyPassword } from './password';
import { json, readBody, HttpError } from './http';
import { handleGoogle } from './google';
import { profileImageKey } from './media';
import { type AuthEnv, type UserRow, currentUser, requireUser, publicUser, checkOrigin, readCookie, cookie, createSession, digest, limited, now } from './session';
export async function handleAuth(request: Request, env: AuthEnv & {MEDIA:R2Bucket;MEDIA_BASE_URL?:string}): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/google' || path === '/api/auth/callback/google') return handleGoogle(request, env);
  if (request.method === 'GET' && path === '/api/auth/providers') return json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });
  if (request.method === 'GET' && path === '/api/auth/me') {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user,request,env) : null }, 200, user ? {} : { 'Set-Cookie': cookie(request, 'session', '', 0) });
  }
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
  if (!['/api/auth/login', '/api/auth/logout'].includes(path)) throw new HttpError(404, '요청한 경로를 찾을 수 없습니다.');
  if (request.method !== 'POST') return json({ error: '지원하지 않는 요청입니다.' }, 405, { Allow: 'POST' });
  checkOrigin(request);
  if (path === '/api/auth/logout') {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(readCookie(request, 'session'))).run();
    return json({ user: null }, 200, { 'Set-Cookie': cookie(request, 'session', '', 0) });
  }
  const body = await readBody(request);
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 256 || !body.password.length) throw new HttpError(400, '이메일과 비밀번호를 확인해 주세요.');
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, '이메일과 비밀번호를 확인해 주세요.');
  if (await limited(env.DB, digest('ip:' + (request.headers.get('CF-Connecting-IP') || 'local')), 30) || await limited(env.DB, digest('email:' + email), 5)) return json({ error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' }, 429, { 'Retry-After': '900' });
  const user = await env.DB.prepare('SELECT * FROM auth_users WHERE email=?').bind(email).first<UserRow>();
  const correct = await verifyPassword(body.password, user?.password_hash ?? null);
  if (!correct || !user || user.disabled) throw new HttpError(401, '이메일 또는 비밀번호가 일치하지 않습니다.');
  await env.DB.prepare('DELETE FROM auth_login_limits WHERE expires_at<=? OR key=?').bind(now(), digest('email:' + email)).run();
  return json({ user: publicUser(user,request,env) }, 200, { 'Set-Cookie': await createSession(request, env, user.id) });
}
