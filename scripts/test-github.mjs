import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21stark.dev',alternate='https://21st-ark.dev',flows=new Map(),tokens=new Map();let exchanges=0;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'github-test'},r2Buckets:['MEDIA'],bindings:{GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',AUTH_ORIGINS:origin+','+alternate,BOOTSTRAP_ADMIN_EMAIL:'owner@example.invalid'},outboundService:async request=>{
  if(request.url==='https://github.com/login/oauth/access_token'){
    exchanges++;const body=new URLSearchParams(await request.text()),flow=flows.get(body.get('code'));assert.ok(flow);assert.equal(body.get('client_id'),'test-client');assert.equal(body.get('client_secret'),'test-secret');assert.equal(body.get('redirect_uri'),flow.redirect);assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),flow.challenge);
    if(flow.error)return Response.json({error:'bad_verification_code'});
    const token=randomBytes(16).toString('hex');tokens.set(token,flow.profile);return Response.json({access_token:token,token_type:'bearer'});
  }
  const profile=tokens.get(request.headers.get('Authorization')?.replace('Bearer ',''));assert.ok(profile);assert.equal(request.headers.get('User-Agent'),'21st-ARK');
  if(request.url==='https://api.github.com/user')return Response.json({id:profile.id,name:profile.name??'GitHub 필자',login:'github-writer',email:'untrusted@example.invalid'});
  if(request.url==='https://api.github.com/user/emails?per_page=100')return Response.json(profile.emails??[{email:profile.email,primary:true,verified:profile.verified??true,visibility:'private'}]);
  throw new Error('Unexpected outbound request');
}}));
try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql','0007_post_reads.sql','0008_github_login.sql','0009_writer_taxonomy.sql','0010_post_comments.sql','0011_signup_consent.sql','0012_writer_applications.sql','0013_account_controls.sql','0014_security_performance.sql','0015_media_references.sql','0016_session_inactivity.sql','0017_notices_reading_history.sql','0018_usernames.sql']){const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(value=>value.trim()))await db.prepare(statement).run();}
  const call=(path,{cookie,site=origin,method='GET',body,headers={}}={})=>mf.dispatchFetch(site+path,{method,headers:{Origin:site,...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body}:{}),redirect:'manual'});
  const session=response=>{const value=response.headers.get('set-cookie')?.match(/(?:__Host-ark_|ark_)session=[a-f0-9]{64}/)?.[0];assert.ok(value);return value;};
  async function begin(site=origin,account,reauth=false){const response=await call('/api/auth/github'+(site.startsWith('http:')?'?origin='+encodeURIComponent(site)+(reauth?'&reauth=1':''):(reauth?'?reauth=1':'')),{site,cookie:account});assert.equal(response.status,302);const url=new URL(response.headers.get('location'));assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('scope'),'read:user user:email');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),site+'/api/auth/callback/github');assert.ok(!response.headers.get('location').includes('test-secret'));return {url,site,cookie:response.headers.get('set-cookie').split(';')[0]+(account?'; '+account:'')};}
  async function finish(flow,profile,error=false){const code=randomBytes(16).toString('hex');flows.set(code,{profile,error,challenge:flow.url.searchParams.get('code_challenge'),redirect:flow.url.searchParams.get('redirect_uri')});const path='/api/auth/callback/github?'+new URLSearchParams({state:flow.url.searchParams.get('state'),code});return {response:await call(path,{site:flow.site,cookie:flow.cookie}),path};}
  const flow=await begin(),created=await finish(flow,{id:123,email:'new@example.invalid'});assert.match(created.response.headers.get('location'),/auth=signup/);
  const ticket=created.response.headers.get('set-cookie').match(/__Host-ark_signup=[a-f0-9]{64}/)[0];
  assert.equal((await (await call('/api/auth/me',{cookie:ticket})).json()).signup.provider,'github');
  assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_users").first()).n,0,'OAuth alone creates no member');
  const legal=await (await call('/api/auth/legal')).json();
  const completed=await call('/api/auth/signup',{cookie:ticket,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GitHub 필자',username:'githubWriter',terms:true,privacy:true,version:legal.version})});assert.equal(completed.status,201);
  const cookie=session(completed);assert.match(created.response.headers.get('set-cookie'),/HttpOnly/);assert.match(created.response.headers.get('set-cookie'),/Secure/);assert.match(created.response.headers.get('set-cookie'),/SameSite=Lax/);
  const user=(await (await call('/api/auth/me',{cookie})).json()).user;assert.equal(user.email,'new@example.invalid');assert.equal(user.role,'reader');
  const info=await (await call('/api/auth/account',{cookie})).json();assert.deepEqual(info.connections,{google:false,github:true});assert.equal(info.github_available,true);assert.ok(!JSON.stringify(info).includes('test-secret'));assert.ok(!JSON.stringify(info).includes('subject'));
  const before=exchanges;assert.match((await call(created.path,{cookie:flow.cookie})).headers.get('location'),/auth_error=state/);assert.equal(exchanges,before,'State cannot be replayed');
  const noCookie=await begin();assert.match((await call('/api/auth/callback/github?state='+noCookie.url.searchParams.get('state')+'&code=unused')).headers.get('location'),/auth_error=state/);assert.equal(exchanges,before);
  const expired=await begin();await db.prepare('UPDATE auth_github_states SET expires_at=0').run();assert.match((await finish(expired,{id:124,email:'expired@example.invalid'})).response.headers.get('location'),/auth_error=state/);
  const cancelled=await begin();assert.match((await call('/api/auth/callback/github?state='+cancelled.url.searchParams.get('state')+'&error=access_denied',{cookie:cancelled.cookie})).headers.get('location'),/auth_error=cancelled/);
  const wrongOrigin=await begin();assert.match((await call('/api/auth/callback/github?state='+wrongOrigin.url.searchParams.get('state')+'&code=unused',{cookie:wrongOrigin.cookie,site:alternate})).headers.get('location'),/auth_error=state/);
  const unverified=await finish(await begin(),{id:125,email:'unverified@example.invalid',verified:false});assert.match(unverified.response.headers.get('location'),/auth_error=github_email/);
  const invalid=await finish(await begin(),{id:'wrong',email:'invalid@example.invalid'});assert.match(invalid.response.headers.get('location'),/auth_error=github/);
  assert.match((await finish(await begin(),{id:126,email:'exchange@example.invalid'},true)).response.headers.get('location'),/auth_error=github/);
  assert.equal((await call('/api/auth/github',{site:'https://untrusted.invalid'})).status,403);assert.equal((await call('/api/auth/github',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);assert.equal((await call('/api/auth/github',{method:'POST',body:'{}'})).status,405);
  await db.prepare("INSERT INTO auth_users(id,email,name,role) VALUES('google-existing','existing@example.invalid','기존 Google 필자','author')").run();await db.prepare("INSERT INTO auth_google_accounts(subject,user_id) VALUES('google-existing-subject','google-existing')").run();
  assert.match((await finish(await begin(),{id:127,email:'existing@example.invalid'})).response.headers.get('location'),/auth_error=existing/);
  const existingToken=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(existingToken).digest('hex'),'google-existing',Math.floor(Date.now()/1000)+3600).run();
  const existingCookie='__Host-ark_session='+existingToken;
  const linked=await finish(await begin(origin,existingCookie),{id:127,email:'existing@example.invalid'});assert.match(linked.response.headers.get('location'),/auth=success/);assert.equal((await db.prepare("SELECT user_id FROM auth_github_accounts WHERE subject='127'").first()).user_id,'google-existing');assert.equal((await db.prepare("SELECT role FROM auth_users WHERE id='google-existing'").first()).role,'author');
  assert.deepEqual((await (await call('/api/auth/account',{cookie:session(linked.response)})).json()).connections,{google:true,github:true});
  assert.equal((await (await call('/api/auth/me',{cookie:existingCookie})).json()).user,null,'New identity linking revokes older sessions');
  assert.equal((await (await call('/api/auth/me',{cookie:existingCookie})).json()).user,null,'Adding a login method invalidates prior sessions');
  let linkCookie=session(linked.response);const reauthenticated=await finish(await begin(origin,linkCookie,true),{id:127,email:'existing@example.invalid'});assert.match(reauthenticated.response.headers.get('location'),/auth=reauth/);linkCookie=session(reauthenticated.response);const wrongIdentity=await finish(await begin(origin,linkCookie,true),{id:131,email:'existing@example.invalid'});assert.match(wrongIdentity.response.headers.get('location'),/auth_error=link/);assert.equal(await db.prepare("SELECT 1 FROM auth_github_accounts WHERE subject='131'").first(),null,'Reauthentication cannot attach a new identity');
  assert.match((await finish(await begin(origin,linkCookie),{id:128,email:'different@example.invalid'})).response.headers.get('location'),/auth_error=link/);
  const lostSession=await begin(origin,linkCookie);lostSession.cookie=lostSession.cookie.split(';')[0];assert.match((await finish(lostSession,{id:127,email:'existing@example.invalid'})).response.headers.get('location'),/auth_error=link/);
  const again=await finish(await begin(),{id:127,email:'existing@example.invalid'});assert.equal((await (await call('/api/auth/me',{cookie:session(again.response)})).json()).user.id,'google-existing');
  const staleLink=await begin(origin,session(again.response));await db.prepare("UPDATE auth_users SET login_version=login_version+1 WHERE id='google-existing'").run();assert.match((await finish(staleLink,{id:127,email:'existing@example.invalid'})).response.headers.get('location'),/auth_error=link/,'In-flight links must match the current connection version');
  await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='google-existing'").run();assert.match((await finish(await begin(),{id:127,email:'existing@example.invalid'})).response.headers.get('location'),/auth_error=disabled/);
  const alt=await finish(await begin(alternate),{id:129,email:'alternate@example.invalid'});assert.match(alt.response.headers.get('location'),/^https:\/\/21st-ark.dev\/\?auth=signup/);
  const local=await finish(await begin('http://127.0.0.1:3000'),{id:130,email:'local@example.invalid'});assert.match(local.response.headers.get('location'),/^http:\/\/127.0.0.1:3000\/\?auth=signup/);assert.match(local.response.headers.get('set-cookie'),/ark_signup=/);
  assert.equal((await call('/api/auth/login',{method:'POST',body:'{}'})).status,410);
  console.log('GitHub OAuth passed: PKCE, state/cookie/origin binding, replay/expiry/cancel handling, verified private email, new readers, explicit linking, existing roles, disabled accounts, both production domains and local callback.');
}finally{await mf.dispose();}
