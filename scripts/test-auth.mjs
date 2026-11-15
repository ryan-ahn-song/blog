import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../apps/backend/src/password.ts';
// Use the same workerd/Miniflare runtime installed by the declared Wrangler dependency.
const require = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const mf = new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'auth-test'},r2Buckets:['MEDIA']}));
try {
  const db=await mf.getD1Database('DB');
  for (const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql']) {
    const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');
    for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  }
  const email='author@example.invalid',password=randomBytes(24).toString('base64url');
  await db.prepare("INSERT INTO auth_users(id,email,name,password_hash,role) VALUES(?,?,?,?,'author')").bind('test-user',email,'테스트 필자',await hashPassword(password)).run();
  const call=(path,body,cookie,origin='https://21stark.dev')=>mf.dispatchFetch(`https://21stark.dev/api/auth/${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.deepEqual(await (await call('me')).json(),{user:null});
  assert.equal((await call('login',{email,password},null,'https://attacker.invalid')).status,403);
  assert.equal((await call('login',{email,password:'incorrect'})).status,401);
  assert.equal((await call('login',{email:'missing@example.invalid',password:'incorrect'})).status,401);
  const login=await call('login',{email,password}); assert.equal(login.status,200);
  const rawCookie=login.headers.get('set-cookie');assert.match(rawCookie,/HttpOnly/);assert.match(rawCookie,/Secure/);assert.match(rawCookie,/SameSite=Lax/);assert.match(rawCookie,/__Host-ark_session=/);
  const cookie=rawCookie.split(';')[0];const account=await login.json();assert.equal(account.user.email,email);assert.equal(account.user.password_hash,undefined);
  assert.equal((await (await call('me',undefined,cookie)).json()).user.id,'test-user');
  const stored=await db.prepare('SELECT token_hash FROM auth_sessions').first();assert.notEqual(stored.token_hash,cookie.split('=')[1]);
  assert.equal((await call('logout',{},cookie)).status,200);
  assert.deepEqual(await (await call('me',undefined,cookie)).json(),{user:null});
  const second=await call('login',{email,password});const secondCookie=second.headers.get('set-cookie').split(';')[0];
  await db.prepare('UPDATE auth_sessions SET expires_at=0').run();
  assert.deepEqual(await (await call('me',undefined,secondCookie)).json(),{user:null});
  for(let i=0;i<5;i++)assert.equal((await call('login',{email:'locked@example.invalid',password:'incorrect'})).status,401);
  assert.equal((await call('login',{email:'locked@example.invalid',password:'incorrect'})).status,429);
  console.log('Auth integration passed: real workerd + isolated D1; login, cookies, session restore, logout, expiry, invalid credentials, CSRF rejection and rate limiting.');
} finally { await mf.dispose(); }
