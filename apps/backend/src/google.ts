import { beginSignup } from './signup';
import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError, json } from './http';
import { type AuthEnv, type UserRow, now, digest, cookie, readCookie, createSession, currentUser, local, limited, linkIdentity } from './session';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
type Flow = { purpose:string; nonce: string; verifier: string; origin: string; link_user_id: string | null; link_version:number; expires_at: number };
function originFor(request: Request, env: AuthEnv) {
  const url = new URL(request.url);
  if (local(request)) {
    const origin = url.searchParams.get('origin') ?? 'http://127.0.0.1:3000';
    if (origin === 'http://127.0.0.1:3000') return origin;
  } else if ((env.AUTH_ORIGINS ?? '').split(',').map(v => v.trim()).includes(url.origin)) return url.origin;
  throw new HttpError(403, '이 주소에서는 Google 로그인을 사용할 수 없습니다.');
}
function redirect(request: Request, origin: string, result: string, session?: string) {
  const headers = new Headers({ Location: origin + '/?' + result, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', cookie(request, 'oauth', '', 0));
  if (session) headers.append('Set-Cookie', session);
  return new Response(null, { status: 303, headers });
}
export async function handleGoogle(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'GET') return json({ error: '지원하지 않는 요청입니다.' }, 405, { Allow: 'GET' });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new HttpError(503, 'Google 로그인 설정을 준비하고 있습니다.');
  const url = new URL(request.url), origin = originFor(request, env);
  if (url.pathname === '/api/auth/google') {
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, '블로그에서 로그인을 시작해 주세요.');
    if (await limited(env.DB, digest('oauth:' + (request.headers.get('CF-Connecting-IP') || 'local')), 40)) throw new HttpError(429, '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
    const state = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url');
    const user = await currentUser(request, env);
    const purpose=url.searchParams.get('reauth')==='1'?'reauth':'link';
    if(purpose==='reauth'&&!user)throw new HttpError(401,'로그인이 필요합니다.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_oauth_states WHERE expires_at<=?').bind(now()),
      env.DB.prepare('INSERT INTO auth_oauth_states(state_hash,nonce,verifier,origin,link_user_id,expires_at,link_version,purpose) VALUES(?,?,?,?,?,?,?,?)').bind(digest(state), nonce, verifier, origin, user?.id ?? null, now() + 600,user?.login_version??0,purpose),
    ]);
    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + '/api/auth/callback/google', response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return new Response(null, { status: 302, headers: { Location: authorize.href, 'Set-Cookie': cookie(request, 'oauth', state, 600), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  const state = url.searchParams.get('state') ?? '';
  if (!/^[a-f0-9]{64}$/.test(state) || state !== readCookie(request, 'oauth')) return redirect(request, origin, 'auth_error=state');
  const flow = await env.DB.prepare('DELETE FROM auth_oauth_states WHERE state_hash=? RETURNING *').bind(digest(state)).first<Flow>();
  if (!flow || flow.expires_at <= now() || flow.origin !== origin) return redirect(request, origin, 'auth_error=state');
  if (url.searchParams.has('error')) return redirect(request, origin, 'auth_error=cancelled');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) return redirect(request, origin, 'auth_error=google');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: origin + '/api/auth/callback/google' }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('exchange');
    const tokens = await response.json() as { id_token?: string };
    if (typeof tokens.id_token !== 'string') throw new Error('token');
    const { payload } = await jwtVerify(tokens.id_token, keys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID, requiredClaims: ['sub', 'email', 'exp', 'iat', 'nonce'], maxTokenAge: '10m', clockTolerance: 5 });
    if (payload.nonce !== flow.nonce || payload.email_verified !== true || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254 || !payload.sub || payload.sub.length > 255 || (payload.azp !== undefined && payload.azp !== env.GOOGLE_CLIENT_ID)) throw new Error('claims');
    const email = payload.email.toLowerCase();
    let user = await env.DB.prepare('SELECT u.* FROM auth_google_accounts g JOIN auth_users u ON u.id=g.user_id WHERE g.subject=?').bind(payload.sub).first<UserRow>();
    if (flow.link_user_id) {
      const signedIn = await currentUser(request, env);
      if (!signedIn || signedIn.id !== flow.link_user_id || signedIn.login_version!==flow.link_version || signedIn.email.toLowerCase() !== email || (user && user.id !== signedIn.id)) return redirect(request, origin, 'auth_error=link');
      if(flow.purpose==='reauth'&&!user)return redirect(request,origin,'auth_error=link');
      user = user ? signedIn : await linkIdentity(env,signedIn,'google',payload.sub);
    } else if (!user) {
      // Never link a password account merely because Google returns the same email.
      if (await env.DB.prepare('SELECT id FROM auth_users WHERE email=?').bind(email).first()) return redirect(request, origin, 'auth_error=existing');
      const name = typeof payload.name === 'string' ? payload.name.trim().slice(0,80) || email.split('@')[0] : email.split('@')[0];
      return beginSignup(request,env,origin,'google',payload.sub,email,name);
    }
    if (!user || user.disabled) return redirect(request, origin, 'auth_error=disabled');
    return redirect(request, origin, flow.purpose==='reauth'?'auth=reauth':'auth=success', await createSession(request, env, user.id,user.login_version));
  } catch {
    console.error('Google authentication failed');
    return redirect(request, origin, 'auth_error=google');
  }
}
