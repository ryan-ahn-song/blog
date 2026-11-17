import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './http';
import { mediaUrl } from './media';
export type Role = 'reader' | 'author' | 'admin';
export type UserRow = { id: string; email: string; name: string; username:string|null;username_key:string|null;username_confirmed:number; bio: string; avatar_key:string|null; cover_key:string|null; role: Role; password_hash: string | null; disabled: number; version: number; created_at: number; login_version:number };
export type AuthEnv = { DB: D1Database; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; AUTH_ORIGINS?: string; BOOTSTRAP_ADMIN_EMAIL?: string };
export const now = () => Math.floor(Date.now() / 1000);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function local(request: Request) { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname); }
function cookieName(request: Request, suffix: string) { return (local(request) ? 'ark_' : '__Host-ark_') + suffix; }
export function readCookie(request: Request, suffix: string) {
  return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName(request, suffix) + '='))?.split('=')[1] ?? '';
}
export function cookie(request: Request, suffix: string, value: string, age: number) {
  return cookieName(request, suffix) + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (local(request) ? '' : '; Secure');
}
export function publicUser(user: UserRow, request:Request, env:{MEDIA_BASE_URL?:string}) { return { id: user.id, email: user.email, name: user.name, username:user.username||'user-'+user.id,needs_username:!user.username_confirmed, bio: user.bio, role: user.role, version: user.version,avatar_key:user.avatar_key,cover_key:user.cover_key,avatar_url:mediaUrl(user.avatar_key,request,env),cover_url:mediaUrl(user.cover_key,request,env) }; }
export async function currentUser(request: Request, env: AuthEnv): Promise<UserRow | null> {
  const token = readCookie(request, 'session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const time=now(),hash=digest(token);
  const seen="CASE WHEN s.last_seen=0 THEN s.created_at ELSE s.last_seen END";
  const user=await env.DB.prepare('SELECT u.*, '+seen+' AS session_seen FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0 AND s.login_version=u.login_version AND '+seen+'>?-CASE u.role WHEN \'admin\' THEN 1800 WHEN \'author\' THEN 3600 ELSE 14400 END AND s.created_at>?-CASE u.role WHEN \'admin\' THEN 28800 WHEN \'author\' THEN 86400 ELSE 604800 END').bind(hash,time,time,time).first<UserRow&{session_seen:number}>();
  if(!user)return null;
  // Throttle activity writes to once per five minutes, rather than every API request.
  if(time-user.session_seen>=300){
    const updated=await env.DB.prepare('UPDATE auth_sessions SET last_seen=? WHERE token_hash=? AND login_version=? AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND disabled=0 AND login_version=?) RETURNING user_id').bind(time,hash,user.login_version,user.id,user.login_version).first();
    if(!updated)return null;
  }
  const {session_seen,...account}=user;return account;
}
export async function requireUser(request: Request, env: AuthEnv, roles: Role[] = ['reader', 'author', 'admin']) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  if (!roles.includes(user.role)) throw new HttpError(403, '이 작업을 할 권한이 없습니다.');
  return user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || !(origin === new URL(request.url).origin || (local(request) && ['http://127.0.0.1:3000', 'http://localhost:3000'].includes(origin ?? '')))) throw new HttpError(403, '허용되지 않은 요청입니다.');
}
export async function createSession(request: Request, env: AuthEnv, userId: string, loginVersion?:number) {
  const token = randomBytes(32).toString('hex');
  const result=await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_pending_signups WHERE token_hash=?').bind(digest(readCookie(request, 'signup'))),
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=? OR (token_hash=? AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND disabled=0 AND (? IS NULL OR login_version=?)))').bind(now(),digest(readCookie(request,'session')),userId,loginVersion??null,loginVersion??null),
    env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,login_version,authenticated_at,last_seen) SELECT ?,id,?,login_version,unixepoch(),unixepoch() FROM auth_users WHERE id=? AND disabled=0 AND (? IS NULL OR login_version=?) RETURNING user_id').bind(digest(token),now()+604800,userId,loginVersion??null,loginVersion??null),
  ]);
  if(!result[2].results.length)throw new HttpError(401,'로그인 계정이 변경되었습니다. 다시 로그인해 주세요.');
  return cookie(request, 'session', token, 604800);
}
export async function limited(db: D1Database, key: string, max: number) {
  const time = now();
  const row = await db.prepare('INSERT INTO auth_login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts').bind(key, time + 900, time, time, time + 900).first<{ attempts: number }>();
  return !row || row.attempts > max;
}

// Sensitive changes require a recent OAuth exchange on this exact session, consumed once.
export async function requireRecentAuth(request:Request,env:AuthEnv,user:UserRow){
  const proof=await env.DB.prepare('UPDATE auth_sessions SET authenticated_at=0 WHERE token_hash=? AND user_id=? AND expires_at>? AND login_version=? AND authenticated_at>=? AND authenticated_at<=? RETURNING user_id').bind(digest(readCookie(request,'session')),user.id,now(),user.login_version,now()-300,now()).first();
  if(!proof)throw new HttpError(428,'계정 보호를 위해 연결된 계정으로 다시 인증해 주세요. 인증 후 5분 안에 한 번 진행할 수 있습니다.');
}

// Linking a new identity is a security change: invalidate every older session atomically.
export async function linkIdentity(env:AuthEnv,user:UserRow,provider:'google'|'github',subject:string){
  const table=provider==='google'?'auth_google_accounts':'auth_github_accounts',token=randomUUID();
  const result=await env.DB.batch([
    env.DB.prepare(`UPDATE auth_users SET login_version=login_version+1,account_change_token=? WHERE id=? AND login_version=? AND disabled=0 AND NOT EXISTS(SELECT 1 FROM ${table} WHERE user_id=?) RETURNING id`).bind(token,user.id,user.login_version,user.id),
    env.DB.prepare(`INSERT INTO ${table}(subject,user_id) SELECT ?,id FROM auth_users WHERE id=? AND account_change_token=? RETURNING user_id`).bind(subject,user.id,token),
  ]);
  if(!result[1].results.length)throw new HttpError(409,'로그인 계정이 변경되었습니다. 다시 로그인해 주세요.');
  return {...user,login_version:user.login_version+1};
}
