import { createHash, randomBytes } from 'node:crypto';
import { verifyPassword } from './password';
type Env = { DB: D1Database };
type UserRow = { id: string; email: string; name: string; role: string; password_hash: string; disabled: number };
const now = () => Math.floor(Date.now() / 1000);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ttl = 7 * 24 * 60 * 60;
function local(request: Request) { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname); }
function cookieName(request: Request) { return local(request) ? 'ark_session' : '__Host-ark_session'; }
function cookie(request: Request, token: string, age: number) { return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local(request) ? '' : '; Secure'}`; }
function token(request: Request) { return request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName(request)}=`))?.split('=')[1] ?? ''; }
function json(data: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(data, {status, headers: {'Cache-Control': 'no-store', ...headers}}); }
function publicUser(user: UserRow) { return {id:user.id, email:user.email, name:user.name, role:user.role}; }
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) throw new Error('body');
  let text = ''; let size = 0; const decoder = new TextDecoder();
  while (true) { const {value,done}=await reader.read(); if(done)break; size+=value.byteLength; if(size>4096){await reader.cancel();throw new Error('body');}text+=decoder.decode(value,{stream:true}); }
  return JSON.parse(text + decoder.decode());
}
async function limited(db: D1Database, key: string, max: number) {
  const time=now();
  const row=await db.prepare(`INSERT INTO auth_login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts`).bind(key,time+900,time,time,time+900).first<{attempts:number}>();
  return !row || row.attempts>max;
}
export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const path=new URL(request.url).pathname;
  if(request.method==='GET' && path==='/api/auth/me') {
    const session=token(request);
    if(!/^[a-f0-9]{64}$/.test(session))return json({user:null});
    const user=await env.DB.prepare('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').bind(digest(session),now()).first<UserRow>();
    return json({user:user?publicUser(user):null},200,user?{}:{'Set-Cookie':cookie(request,'',0)});
  }
  if(!['/api/auth/login','/api/auth/logout'].includes(path))return json({error:'요청한 경로를 찾을 수 없습니다.'},404);
  if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405,{'Allow':'POST'});
  const origin=request.headers.get('Origin'); const url=new URL(request.url);
  const validOrigin=origin===url.origin || (local(request)&&['http://127.0.0.1:3000','http://localhost:3000'].includes(origin??''));
  if(!validOrigin || request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'허용되지 않은 요청입니다.'},403);
  if(path==='/api/auth/logout') {
    const session=token(request);
    if(/^[a-f0-9]{64}$/.test(session))await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(session)).run();
    return json({user:null},200,{'Set-Cookie':cookie(request,'',0)});
  }
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'잘못된 요청 형식입니다.'},415);
  let body: {email?:unknown; password?:unknown};
  try { body=await readBody(request) as typeof body; } catch { return json({error:'이메일과 비밀번호를 확인해 주세요.'},400); }
  if(!body || typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>256||!body.password.length)return json({error:'이메일과 비밀번호를 확인해 주세요.'},400);
  const email=body.email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'이메일과 비밀번호를 확인해 주세요.'},400);
  const ip=request.headers.get('CF-Connecting-IP') || 'local';
  // D1-backed counters remain effective across Worker instances.
  const ipLimited=await limited(env.DB,digest(`ip:${ip}`),30);
  if(ipLimited)return json({error:'로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.'},429,{'Retry-After':'900'});
  const emailLimited=await limited(env.DB,digest(`email:${email}`),5);
  if(emailLimited)return json({error:'로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.'},429,{'Retry-After':'900'});
  const user=await env.DB.prepare('SELECT * FROM auth_users WHERE email=?').bind(email).first<UserRow>();
  const correct=await verifyPassword(body.password,user?.password_hash??null);
  if(!correct||!user||user.disabled)return json({error:'이메일 또는 비밀번호가 일치하지 않습니다.'},401);
  const session=randomBytes(32).toString('hex');
  const old=token(request);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=? OR token_hash=?').bind(now(),digest(old)),
    env.DB.prepare('DELETE FROM auth_login_limits WHERE expires_at<=? OR key=?').bind(now(),digest(`email:${email}`)),
    env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(digest(session),user.id,now()+ttl),
  ]);
  return json({user:publicUser(user)},200,{'Set-Cookie':cookie(request,session,ttl)});
}
