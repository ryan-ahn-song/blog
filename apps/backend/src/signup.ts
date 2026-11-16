import { randomBytes, randomUUID } from 'node:crypto';
import { HttpError, json, readBody } from './http';
import { legal } from './legal';
import { type AuthEnv, type UserRow, now, digest, cookie, readCookie, checkOrigin, createSession, currentUser, publicUser } from './session';
type Pending = {provider:'google'|'github';subject:string;email:string;suggested_name:string;expires_at:number};
export async function pendingSignup(request:Request,env:AuthEnv) {
  await env.DB.prepare('DELETE FROM auth_pending_signups WHERE expires_at<=?').bind(now()).run();
  const token=readCookie(request,'signup');
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  return env.DB.prepare('SELECT * FROM auth_pending_signups WHERE token_hash=? AND expires_at>?').bind(digest(token),now()).first<Pending>();
}
export async function beginSignup(request:Request,env:AuthEnv,origin:string,provider:Pending['provider'],subject:string,email:string,name:string) {
  const token=randomBytes(32).toString('hex');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_pending_signups WHERE expires_at<=? OR token_hash=?').bind(now(),digest(readCookie(request,'signup'))),
    env.DB.prepare('INSERT INTO auth_pending_signups(token_hash,provider,subject,email,suggested_name,expires_at) VALUES(?,?,?,?,?,?)').bind(digest(token),provider,subject,email,name.slice(0,80),now()+1800),
  ]);
  const headers=new Headers({Location:origin+'/?auth=signup','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  headers.append('Set-Cookie',cookie(request,provider==='google'?'oauth':'github_oauth','',0));
  headers.append('Set-Cookie',cookie(request,'signup',token,1800));
  return new Response(null,{status:303,headers});
}
export async function handleSignup(request:Request,env:AuthEnv&{MEDIA_BASE_URL?:string}) {
  if(!['POST','DELETE'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'POST, DELETE'});
  checkOrigin(request);
  const hash=digest(readCookie(request,'signup'));
  if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM auth_pending_signups WHERE token_hash=?').bind(hash).run();
    return json({signup:null},200,{'Set-Cookie':cookie(request,'signup','',0)});
  }
  if(await currentUser(request,env))throw new HttpError(409,'이미 로그인되어 있습니다. 화면을 새로고침해 주세요.');
  const body=await readBody(request);
  if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80||/[\p{Cc}\p{Cf}]/u.test(body.name))throw new HttpError(400,'표시 이름을 1~80자로 입력해 주세요.');
  if(body.terms!==true||body.privacy!==true)throw new HttpError(400,'필수 약관과 개인정보 수집·이용 동의를 확인해 주세요.');
  if(body.version!==legal.version)throw new HttpError(409,'약관이 변경되었습니다. 화면을 새로고침하고 다시 확인해 주세요.');
  // DELETE RETURNING consumes the one-time ticket before account creation; concurrent requests cannot both succeed.
  const pending=await env.DB.prepare('DELETE FROM auth_pending_signups WHERE token_hash=? AND expires_at>? RETURNING *').bind(hash,now()).first<Pending>();
  if(!pending)throw new HttpError(401,'가입 인증이 만료되었습니다. 소셜 로그인을 다시 시작해 주세요.');
  if(await env.DB.prepare('SELECT id FROM auth_users WHERE email=?').bind(pending.email).first())throw new HttpError(409,'이미 가입된 이메일입니다. 기존 계정으로 로그인해 주세요.');
  const id=randomUUID(),role=pending.email===env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()?'admin':'reader',time=now();
  const table=pending.provider==='google'?'auth_google_accounts':'auth_github_accounts';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,pending.email,body.name.trim(),role),
    env.DB.prepare(`INSERT INTO ${table}(subject,user_id) VALUES(?,?)`).bind(pending.subject,id),
    env.DB.prepare("INSERT INTO auth_consents(user_id,document,version,accepted_at) VALUES(?,'terms',?,?),(?,'privacy',?,?)").bind(id,legal.version,time,id,legal.version,time),
  ]);
  const user=await env.DB.prepare('SELECT * FROM auth_users WHERE id=?').bind(id).first<UserRow>();
  const headers=new Headers();headers.append('Set-Cookie',await createSession(request,env,id));headers.append('Set-Cookie',cookie(request,'signup','',0));
  return json({user:publicUser(user!,request,env)},201,headers);
}
