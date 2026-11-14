import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from './http';
export type Role = 'reader' | 'author' | 'admin';
export type UserRow = { id: string; email: string; name: string; bio: string; role: Role; password_hash: string | null; disabled: number; version: number; created_at: number };
export type AuthEnv = { DB: D1Database; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_ORIGINS?: string; BOOTSTRAP_ADMIN_EMAIL?: string };
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
export function publicUser(user: UserRow) { return { id: user.id, email: user.email, name: user.name, bio: user.bio, role: user.role, version: user.version }; }
export async function currentUser(request: Request, env: AuthEnv): Promise<UserRow | null> {
  const token = readCookie(request, 'session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').bind(digest(token), now()).first<UserRow>();
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
export async function createSession(request: Request, env: AuthEnv, userId: string) {
  const token = randomBytes(32).toString('hex');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=? OR token_hash=?').bind(now(), digest(readCookie(request, 'session'))),
    env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(token), userId, now() + 604800),
  ]);
  return cookie(request, 'session', token, 604800);
}
export async function limited(db: D1Database, key: string, max: number) {
  const time = now();
  const row = await db.prepare('INSERT INTO auth_login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts').bind(key, time + 900, time, time, time + 900).first<{ attempts: number }>();
  return !row || row.attempts > max;
}
