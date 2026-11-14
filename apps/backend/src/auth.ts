import { verifyPassword } from './password';
import { json, readBody, HttpError } from './http';
import { handleGoogle } from './google';
import { type AuthEnv, type UserRow, currentUser, publicUser, checkOrigin, readCookie, cookie, createSession, digest, limited, now } from './session';
export async function handleAuth(request: Request, env: AuthEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/google' || path === '/api/auth/callback/google') return handleGoogle(request, env);
  if (request.method === 'GET' && path === '/api/auth/providers') return json({ google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) });
  if (request.method === 'GET' && path === '/api/auth/me') {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null }, 200, user ? {} : { 'Set-Cookie': cookie(request, 'session', '', 0) });
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
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': await createSession(request, env, user.id) });
}
