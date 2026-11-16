import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes,createHash } from 'node:crypto';
// Use the same workerd/Miniflare runtime installed by the declared Wrangler dependency.
const require = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const mf = new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'auth-test'},r2Buckets:['MEDIA']}));
try {
  const db=await mf.getD1Database('DB');
  for (const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql','0007_post_reads.sql','0008_github_login.sql','0009_writer_taxonomy.sql','0010_post_comments.sql','0011_signup_consent.sql','0012_writer_applications.sql','0013_account_controls.sql','0014_security_performance.sql','0015_media_references.sql','0016_session_inactivity.sql']) {
    const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');
    for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  }
  const email='author@example.invalid';
  await db.prepare("INSERT INTO auth_users(id,email,name,password_hash,role) VALUES(?,?,?,?,'author')").bind('test-user',email,'테스트 필자','preserved-unused-hash').run();
  const call=(path,body,cookie,origin='https://21stark.dev')=>mf.dispatchFetch(`https://21stark.dev/api/auth/${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.deepEqual(await (await call('me')).json(),{user:null});
  assert.equal((await call('login',{email,password:'any-password'})).status,410);
  assert.equal((await call('login')).status,410);
  assert.deepEqual(await (await call('providers')).json(),{google:false,github:false});
  assert.equal((await call('github')).status,503);
  const token=randomBytes(32).toString('hex'),cookie='__Host-ark_session='+token;
  await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),'test-user',Math.floor(Date.now()/1000)+3600).run();
  const account=await (await call('me',undefined,cookie)).json();assert.equal(account.user.id,'test-user');assert.equal(account.user.password_hash,undefined);
  assert.equal((await call('account')).status,401);
  assert.equal((await call('logout',{},cookie,'https://attacker.invalid')).status,403);
  assert.equal((await (await call('me',undefined,cookie)).json()).user.id,'test-user','CSRF failure preserves the session');
  const logout=await call('logout',{},cookie);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/HttpOnly/);assert.match(logout.headers.get('set-cookie'),/Secure/);assert.match(logout.headers.get('set-cookie'),/SameSite=Lax/);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.deepEqual(await (await call('me',undefined,cookie)).json(),{user:null});
  await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),'test-user',0).run();
  assert.deepEqual(await (await call('me',undefined,cookie)).json(),{user:null});
  const legal=await (await call('legal')).json();assert.equal(legal.contact,'21stark.dev@gmail.com');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM auth_consents').first()).n,0,'Legacy acceptance must never be fabricated');
  const time=Math.floor(Date.now()/1000);
  const ticket=async (subject,expires=time+1800)=>{const value=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_pending_signups(token_hash,provider,subject,email,suggested_name,expires_at) VALUES(?,?,?,?,?,?)').bind(createHash('sha256').update(value).digest('hex'),'google',subject,subject+'@example.invalid','Suggested',expires).run();return '__Host-ark_signup='+value;};
  const pending=await ticket('signup-user'),good={name:'  선택한 이름  ',terms:true,privacy:true,version:legal.version,role:'admin'};
  const state=await (await call('me',undefined,pending)).json();assert.equal(state.user,null);assert.equal(state.signup.name,'Suggested');assert.equal(state.signup.email,undefined);
  assert.equal((await call('signup',{...good,privacy:false},pending)).status,400);
  assert.equal((await call('signup',{...good,terms:'true'},pending)).status,400);
  assert.equal((await call('signup',{...good,version:'old'},pending)).status,409);
  for(const name of ['   ','a'.repeat(81),'bad\u0000name'])assert.equal((await call('signup',{...good,name},pending)).status,400);
  assert.equal((await call('signup',good,pending,'https://attacker.invalid')).status,403);
  assert.equal((await call('account',undefined,pending)).status,401,'Pending identity grants no member permissions');
  const completed=await call('signup',good,pending);assert.equal(completed.status,201);const joined=(await completed.json()).user;assert.equal(joined.name,'선택한 이름');assert.equal(joined.role,'reader','Request cannot grant roles');
  const consents=(await db.prepare('SELECT * FROM auth_consents WHERE user_id=? ORDER BY document').bind(joined.id).all()).results;assert.deepEqual(consents.map(row=>row.document),['privacy','terms']);assert.ok(consents.every(row=>row.version===legal.version&&row.accepted_at>=time));
  assert.equal((await call('signup',good,pending)).status,401,'Signup ticket is single use');
  const loginCookie=completed.headers.get('set-cookie').match(/__Host-ark_session=[a-f0-9]{64}/)[0];assert.equal((await (await call('me',undefined,loginCookie)).json()).user.id,joined.id);
  const expired=await ticket('expired',0);assert.equal((await call('signup',good,expired)).status,401);
  const cancel=await ticket('cancelled');const cancelled=await mf.dispatchFetch('https://21stark.dev/api/auth/signup',{method:'DELETE',headers:{Origin:'https://21stark.dev',Cookie:cancel}});assert.equal(cancelled.status,200);assert.equal((await call('signup',good,cancel)).status,401);
  const concurrent=await ticket('concurrent');const pair=await Promise.all([call('signup',good,concurrent),call('signup',good,concurrent)]);assert.deepEqual(pair.map(r=>r.status).sort(),[201,401]);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_users WHERE email='concurrent@example.invalid'").first()).n,1);
  console.log('Auth integration passed: retired password login, provider readiness, private account endpoint, hashed sessions, restore/logout/expiry and CSRF protection.');
} finally { await mf.dispose(); }
