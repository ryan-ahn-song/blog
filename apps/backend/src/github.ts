import { beginSignup } from './signup';
import { randomBytes,createHash } from 'node:crypto';
import { HttpError,json } from './http';
import { type AuthEnv,type UserRow,now,digest,cookie,readCookie,createSession,currentUser,local,limited,linkIdentity } from './session';

type Flow={purpose:string;verifier:string;origin:string;link_user_id:string|null;link_version:number;expires_at:number};
function originFor(request:Request,env:AuthEnv){
  const url=new URL(request.url);
  if(local(request)){const origin=url.searchParams.get('origin')??'http://127.0.0.1:3000';if(origin==='http://127.0.0.1:3000')return origin;}
  else if((env.AUTH_ORIGINS??'').split(',').map(value=>value.trim()).includes(url.origin))return url.origin;
  throw new HttpError(403,'이 주소에서는 GitHub 로그인을 사용할 수 없습니다.');
}
function redirect(request:Request,origin:string,result:string,session?:string){
  const headers=new Headers({Location:origin+'/?'+result,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  headers.append('Set-Cookie',cookie(request,'github_oauth','',0));if(session)headers.append('Set-Cookie',session);
  return new Response(null,{status:303,headers});
}
export async function handleGitHub(request:Request,env:AuthEnv):Promise<Response>{
  if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)throw new HttpError(503,'GitHub 로그인 설정을 준비하고 있습니다.');
  const url=new URL(request.url),origin=originFor(request,env);
  if(url.pathname==='/api/auth/github'){
    if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HttpError(403,'블로그에서 로그인을 시작해 주세요.');
    if(await limited(env.DB,digest('github-oauth:'+(request.headers.get('CF-Connecting-IP')||'local')),40))throw new HttpError(429,'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
    const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url'),actor=await currentUser(request,env);
    const purpose=url.searchParams.get('reauth')==='1'?'reauth':'link';
    if(purpose==='reauth'&&!actor)throw new HttpError(401,'로그인이 필요합니다.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_github_states WHERE expires_at<=?').bind(now()),
      env.DB.prepare('INSERT INTO auth_github_states(state_hash,verifier,origin,link_user_id,expires_at,link_version,purpose) VALUES(?,?,?,?,?,?,?)').bind(digest(state),verifier,origin,actor?.id??null,now()+600,actor?.login_version??0,purpose),
    ]);
    const authorize=new URL('https://github.com/login/oauth/authorize');
    authorize.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:origin+'/api/auth/callback/github',scope:'read:user user:email',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
    return new Response(null,{status:302,headers:{Location:authorize.href,'Set-Cookie':cookie(request,'github_oauth',state,600),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  const state=url.searchParams.get('state')??'';
  if(!/^[a-f0-9]{64}$/.test(state)||state!==readCookie(request,'github_oauth'))return redirect(request,origin,'auth_error=state');
  const flow=await env.DB.prepare('DELETE FROM auth_github_states WHERE state_hash=? RETURNING *').bind(digest(state)).first<Flow>();
  if(!flow||flow.expires_at<=now()||flow.origin!==origin)return redirect(request,origin,'auth_error=state');
  if(url.searchParams.has('error'))return redirect(request,origin,'auth_error=cancelled');
  const code=url.searchParams.get('code');if(!code||code.length>4096)return redirect(request,origin,'auth_error=github');
  let stage='exchange';
  try{
    const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,code_verifier:flow.verifier,redirect_uri:origin+'/api/auth/callback/github'}),signal:AbortSignal.timeout(10000),redirect:'manual'});
    if(!response.ok)throw new Error('exchange');
    stage='token';
    const token=await response.json() as {access_token?:string;token_type?:string;error?:string};
    if(token.error||typeof token.access_token!=='string'||!token.access_token||token.token_type?.toLowerCase()!=='bearer')throw new Error('token');
    stage='profile';
    const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token.access_token,'User-Agent':'21st-ARK','X-GitHub-Api-Version':'2026-03-10'};
    const [profileResponse,emailsResponse]=await Promise.all([
      fetch('https://api.github.com/user',{headers,signal:AbortSignal.timeout(10000),redirect:'manual'}),
      fetch('https://api.github.com/user/emails?per_page=100',{headers,signal:AbortSignal.timeout(10000),redirect:'manual'}),
    ]);
    if(!profileResponse.ok||!emailsResponse.ok)throw new Error('profile');
    const profile=await profileResponse.json() as {id?:number;login?:string;name?:string},emails=await emailsResponse.json() as {email?:string;primary?:boolean;verified?:boolean}[];
    if(!Number.isSafeInteger(profile.id)||!profile.id||profile.id<1||!Array.isArray(emails))throw new Error('identity');
    const primary=emails.find(email=>email.primary===true&&email.verified===true);
    if(typeof primary?.email!=='string'||primary.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary.email))return redirect(request,origin,'auth_error=github_email');
    stage='account';
    const email=primary.email.toLowerCase(),subject=String(profile.id);
    let user=await env.DB.prepare('SELECT u.* FROM auth_github_accounts g JOIN auth_users u ON u.id=g.user_id WHERE g.subject=?').bind(subject).first<UserRow>();
    if(flow.link_user_id){
      const actor=await currentUser(request,env);
      if(!actor||actor.id!==flow.link_user_id||actor.login_version!==flow.link_version||actor.email.toLowerCase()!==email||(user&&user.id!==actor.id))return redirect(request,origin,'auth_error=link');
      if(flow.purpose==='reauth'&&!user)return redirect(request,origin,'auth_error=link');
      user = user ? actor : await linkIdentity(env,actor,'github',subject);
    }else if(!user){
      // Linking an existing identity requires its authenticated session, even with a verified matching email.
      if(await env.DB.prepare('SELECT id FROM auth_users WHERE email=?').bind(email).first())return redirect(request,origin,'auth_error=existing');
      const name=(typeof profile.name==='string'?profile.name.trim():'')||(typeof profile.login==='string'?profile.login:email.split('@')[0]);
      return beginSignup(request,env,origin,'github',subject,email,name);
    }
    if(!user||user.disabled)return redirect(request,origin,'auth_error=disabled');
    stage='session';
    return redirect(request,origin,flow.purpose==='reauth'?'auth=reauth':'auth=success',await createSession(request,env,user.id,user.login_version));
  }catch{console.error('GitHub authentication failed',stage);return redirect(request,origin,'auth_error=github');}
}
