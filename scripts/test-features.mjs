import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const require = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const origin = 'https://21stark.dev', clientId = 'test-client', owner = 'owner@example.invalid';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const exchanges = new Map();
let exchangesCount = 0;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: fileURLToPath(new URL('../apps/backend/dist/index.js', import.meta.url)), compatibilityDate: '2026-11-10', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'features-test' }, r2Buckets: ['MEDIA'],
  bindings: { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: 'test-secret', AUTH_ORIGINS: origin + ',https://21st-ark.dev', BOOTSTRAP_ADMIN_EMAIL: owner, MEDIA_BASE_URL: 'https://media.21stark.dev' },
  outboundService: async request => {
    if (request.url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (request.url === 'https://oauth2.googleapis.com/token') {
      exchangesCount++;
      const body = new URLSearchParams(await request.text()), value = exchanges.get(body.get('code'));
      assert.ok(value, 'Only test authorization codes are exchanged');
      assert.equal(body.get('client_secret'), 'test-secret');
      assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), value.challenge);
      assert.equal(body.get('redirect_uri'), value.redirect);
      return Response.json({ id_token: value.token });
    }
    throw new Error('Unexpected outbound request');
  },
}));
try {
  const db = await mf.getD1Database('DB');
  async function migrate(file) { const sql = await readFile(new URL('../apps/backend/migrations/' + file, import.meta.url), 'utf8'); for (const s of sql.split(';').filter(s => s.trim())) await db.prepare(s).run(); }
  await migrate('0001_auth.sql');
  await db.prepare("INSERT INTO auth_users(id,email,name,password_hash,role) VALUES('legacy','legacy@example.invalid','기존 작성자','legacy-hash','author')").run();
  const oldToken = randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(oldToken).digest('hex'), 'legacy', Math.floor(Date.now()/1000)+3600).run();
  await migrate('0002_google_roles_posts.sql');
  await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category) VALUES('pre-migration','legacy','기존 초안','소개','기존 본문','tech')").run();
  await migrate('0003_live_content.sql');
  assert.deepEqual(JSON.parse((await db.prepare("SELECT topic_ids FROM posts WHERE id='pre-migration'").first()).topic_ids),['tech']);
  const call = (path, { cookie, method = 'GET', body, site = origin, type = 'application/json', csrf = site } = {}) => mf.dispatchFetch(site + path, { method, headers: { Origin: csrf, 'Content-Type': type, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) }), redirect: 'manual' });
  const sessionCookie = r => { const match = r.headers.get('set-cookie')?.match(/__Host-ark_session=[a-f0-9]{64}/); assert.ok(match); return match[0]; };
  assert.equal((await (await call('/api/auth/me', {cookie:'__Host-ark_session='+oldToken})).json()).user.id, 'legacy', 'Migration preserves sessions');
  async function begin(site=origin) { const r=await call('/api/auth/google',{site});assert.equal(r.status,302);const url=new URL(r.headers.get('location'));assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');return {url,cookie:r.headers.get('set-cookie').split(';')[0],site}; }
  async function finish(flow, email, subject, overrides={}, key=privateKey) {
    const code=randomBytes(16).toString('hex');
    const payload={email,email_verified:true,name:'Google 사용자',nonce:flow.url.searchParams.get('nonce'),...overrides};
    const token=await new SignJWT(payload).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(overrides.iss??'https://accounts.google.com').setAudience(overrides.aud??clientId).setSubject(subject).setIssuedAt(overrides.iat??Math.floor(Date.now()/1000)).setExpirationTime(overrides.exp??'5m').sign(key);
    exchanges.set(code,{token,challenge:flow.url.searchParams.get('code_challenge'),redirect:flow.url.searchParams.get('redirect_uri')});
    const path='/api/auth/callback/google?'+new URLSearchParams({state:flow.url.searchParams.get('state'),code});
    return {response:await call(path,{cookie:flow.cookie,site:flow.site}),path};
  }
  async function login(email, subject, site=origin) { const {response}=await finish(await begin(site),email,subject);assert.equal(new URL(response.headers.get('location')).searchParams.get('auth'),'success');return sessionCookie(response); }
  const readerCookie=await login('reader@example.invalid','google-reader');
  const reader=(await (await call('/api/auth/me',{cookie:readerCookie})).json()).user;
  assert.equal(reader.role,'reader');
  const adminCookie=await login(owner,'google-owner');
  const admin=(await (await call('/api/auth/me',{cookie:adminCookie})).json()).user;
  assert.equal(admin.role,'admin');
  assert.equal((await call('/api/admin/users')).status,401);
  assert.equal((await call('/api/admin/users',{cookie:readerCookie})).status,403);
  assert.equal((await call('/api/posts',{method:'POST',cookie:readerCookie,body:{}})).status,403);
  const users=(await (await call('/api/admin/users?role=reader',{cookie:adminCookie})).json()).users;
  assert.equal(users.length,1);assert.equal(users[0].password_hash,undefined);
  assert.equal((await call('/api/admin/users/'+admin.id,{method:'PATCH',cookie:adminCookie,body:{role:'reader',disabled:false,version:0}})).status,400);
  assert.equal((await call('/api/admin/users/'+reader.id,{method:'PATCH',cookie:adminCookie,body:{role:'author',disabled:false,version:0},csrf:'https://attacker.invalid'})).status,403);
  assert.equal((await call('/api/admin/users/'+reader.id,{method:'PATCH',cookie:adminCookie,body:{role:'author',disabled:false,version:0}})).status,200);
  assert.equal((await (await call('/api/auth/me',{cookie:readerCookie})).json()).user.role,'author');
  assert.equal((await call('/api/admin/users/'+reader.id,{method:'PATCH',cookie:adminCookie,body:{role:'admin',disabled:false,version:0}})).status,409);
  const form={title:'실제 글 작성 검사',summary:'요약',body:'첫 문단\n\n두 번째 문단 <script>alert(1)</script>',category:'tech',topic_ids:['tech','frontend'],status:'draft',image_key:null};
  assert.equal((await call('/api/posts',{method:'POST',cookie:readerCookie,body:{...form,category:'life'}})).status,400);
  assert.equal((await call('/api/posts',{method:'POST',body:form})).status,401);
  assert.equal((await call('/api/posts',{method:'POST',cookie:readerCookie,body:form,csrf:'https://attacker.invalid'})).status,403);
  const create=await call('/api/posts',{method:'POST',cookie:readerCookie,body:form});assert.equal(create.status,201);const post=(await create.json()).post;
  assert.equal((await (await call('/api/posts')).json()).total,0);
  assert.equal((await call('/api/posts/'+post.id)).status,404);
  assert.equal((await call('/api/posts/'+post.id+'/like',{method:'PUT',cookie:readerCookie,body:{active:true}})).status,404);
  const otherCookie=await login('other@example.invalid','google-other');
  assert.equal((await call('/api/posts/'+post.id,{cookie:otherCookie})).status,404);
  await db.prepare("UPDATE auth_users SET role='author' WHERE email='other@example.invalid'").run();
  assert.equal((await call('/api/posts/'+post.id,{method:'PUT',cookie:otherCookie,body:{...form,revision:1}})).status,403);
  const published=await call('/api/posts/'+post.id,{method:'PUT',cookie:readerCookie,body:{...form,status:'published',revision:1}});assert.equal(published.status,200);
  assert.equal((await (await call('/api/posts')).json()).total,1);
  assert.equal((await call('/api/posts/'+post.id)).status,200);
  const react=(cookie,kind,active)=>call('/api/posts/'+post.id+'/'+kind,{method:'PUT',cookie,body:{active}});
  assert.equal((await react(undefined,'like',true)).status,401);
  assert.equal((await call('/api/posts?bookmarked=1')).status,401);
  assert.equal((await call('/api/posts/'+post.id+'/like',{method:'PUT',cookie:readerCookie,body:{active:true},csrf:'https://attacker.invalid'})).status,403);
  for(let i=0;i<2;i++)assert.equal((await react(readerCookie,'like',true)).status,200);
  assert.equal((await (await call('/api/posts/'+post.id)).json()).post.like_count,1,'Likes are idempotent');
  await react(otherCookie,'like',true);
  const publicPost=(await (await call('/api/posts/'+post.id)).json()).post;
  assert.equal(publicPost.like_count,2);assert.equal(publicPost.liked,false);assert.equal(publicPost.saved,false);
  assert.deepEqual(publicPost.topic_ids,['tech','frontend']);
  await react(readerCookie,'bookmark',true);await react(readerCookie,'bookmark',true);
  const saved=await (await call('/api/posts?bookmarked=1',{cookie:readerCookie})).json();assert.equal(saved.total,1);assert.equal(saved.posts[0].saved,true);assert.equal(saved.posts[0].liked,true);
  assert.equal((await (await call('/api/posts?bookmarked=1',{cookie:otherCookie})).json()).total,0,'Bookmarks are private to each account');
  const restoredCookie=await login('reader@example.invalid','google-reader');
  assert.equal((await (await call('/api/posts?bookmarked=1',{cookie:restoredCookie})).json()).total,1,'Bookmarks survive a different login session');
  const other=(await (await call('/api/auth/me',{cookie:otherCookie})).json()).user;
  const profile=await call('/api/auth/profile',{method:'PATCH',cookie:otherCookie,body:{name:'실제 작성자',bio:'데이터베이스에 저장한 소개',version:other.version,role:'admin'}});
  assert.equal(profile.status,200);assert.equal((await profile.json()).user.role,'author','Profile editing cannot elevate roles');
  assert.equal((await call('/api/auth/profile',{method:'PATCH',cookie:otherCookie,body:{name:'충돌',bio:'',version:other.version}})).status,409);
  assert.equal((await call('/api/auth/profile',{method:'PATCH',cookie:otherCookie,body:{name:'차단',bio:'',version:other.version+1},csrf:'https://attacker.invalid'})).status,403);
  const catalog=(await (await call('/api/topics')).json()).topics;assert.equal(catalog.find(t=>t.id==='frontend').post_count,1);
  const realWriters=(await (await call('/api/writers')).json()).writers;
  assert.equal(realWriters.find(w=>w.id==='legacy').post_count,0,'Writers with no published posts still appear');
  assert.equal(realWriters.find(w=>w.id===other.id).bio,'데이터베이스에 저장한 소개');
  const fixtures=Array.from({length:25},(_,i)=>db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category,status,published_at,topic_ids) VALUES(?,?,?,?,?,'tech','published',?,?)").bind('content-'+i,other.id,'데이터 글 '+i,'소개',i===24?'unique marker beyond page one':'본문',1000+i,JSON.stringify(['tech','backend'])));
  await db.batch(fixtures);
  const pageOne=await (await call('/api/posts')).json(),pageTwo=await (await call('/api/posts?page=1')).json();assert.equal(pageOne.posts.length,20);assert.equal(pageTwo.posts.length,6);
  const search=await (await call('/api/posts?q=unique%20marker')).json();assert.equal(search.total,1);assert.equal(search.posts[0].id,'content-24');
  assert.equal((await (await call('/api/posts?q=%25')).json()).total,0,'Search treats percent literally');
  assert.equal((await (await call('/api/posts?topic=backend')).json()).total,25);
  assert.equal((await (await call('/api/posts?q='+encodeURIComponent('백엔드'))).json()).total,25,'Search includes saved topic names');
  assert.equal((await (await call('/api/posts?topic=frontend')).json()).total,1);
  assert.equal((await (await call('/api/posts?author='+other.id)).json()).total,25);
  assert.equal((await (await call('/api/posts?category=life')).json()).total,0);
  assert.equal((await (await call('/api/writers?q=unique%20marker')).json()).writers[0].id,other.id);
  await db.prepare("DELETE FROM posts WHERE id LIKE 'content-%'").run();
  assert.equal((await call('/api/posts/'+post.id,{method:'PUT',cookie:readerCookie,body:{...form,revision:1}})).status,409);
  assert.equal((await call('/api/posts/'+post.id,{method:'PUT',cookie:adminCookie,body:{...form,revision:2}})).status,200);
  assert.equal((await (await call('/api/posts')).json()).total,0,'Unpublishing hides public content');
  assert.equal((await (await call('/api/posts?bookmarked=1',{cookie:readerCookie})).json()).total,0,'Unpublished bookmarks stay private');
  assert.equal((await (await call('/api/topics')).json()).topics.find(t=>t.id==='frontend').post_count,0,'Drafts do not contribute topic popularity');
  const writerList=await (await call('/api/writers')).json();assert.ok(writerList.writers.length);assert.ok(!JSON.stringify(writerList).includes('@'));
  assert.equal((await call('/api/media',{method:'POST',cookie:readerCookie,type:'image/png',body:'not an image'})).status,415);
  const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hS0AAAAASUVORK5CYII=','base64'));
  const upload=await call('/api/media',{method:'POST',cookie:readerCookie,type:'image/png',body:png});assert.equal(upload.status,201);const image=await upload.json();assert.ok(image.key.startsWith('posts/'+reader.id+'/'));
  assert.equal((await call('/api/media/'+image.key)).status,200);
  assert.equal((await call('/api/posts',{method:'POST',cookie:otherCookie,body:{...form,image_key:image.key}})).status,403);
  assert.equal((await call('/api/posts',{method:'POST',cookie:readerCookie,body:{...form,image_key:image.key}})).status,201);
  // Session role changes and suspension take effect immediately.
  assert.equal((await call('/api/admin/users/'+reader.id,{method:'PATCH',cookie:adminCookie,body:{role:'reader',disabled:false,version:1}})).status,200);
  assert.equal((await call('/api/posts',{method:'POST',cookie:readerCookie,body:form})).status,403);
  assert.equal((await call('/api/admin/users/'+reader.id,{method:'PATCH',cookie:adminCookie,body:{role:'reader',disabled:true,version:2}})).status,200);
  assert.equal((await (await call('/api/auth/me',{cookie:readerCookie})).json()).user,null);
  const disabled=await finish(await begin(),'reader@example.invalid','google-reader');assert.match(disabled.response.headers.get('location'),/auth_error=disabled/);
  // Account linking is explicit and binds to an existing session.
  const conflict=await finish(await begin(),'legacy@example.invalid','google-legacy');assert.match(conflict.response.headers.get('location'),/auth_error=existing/);
  const linkedStart=await call('/api/auth/google',{cookie:'__Host-ark_session='+oldToken});
  const linkedFlow={url:new URL(linkedStart.headers.get('location')),cookie:linkedStart.headers.get('set-cookie').split(';')[0]+'; __Host-ark_session='+oldToken,site:origin};
  const linked=await finish(linkedFlow,'legacy@example.invalid','google-legacy');assert.match(linked.response.headers.get('location'),/auth=success/);
  assert.equal((await db.prepare("SELECT role FROM auth_users WHERE id='legacy'").first()).role,'author');
  // Callback must match browser state, cannot be replayed, and validates signed claims.
  const flow=await begin();const valid=await finish(flow,'fresh@example.invalid','google-fresh');assert.match(valid.response.headers.get('location'),/auth=success/);
  const before=exchangesCount;assert.match((await call(valid.path,{cookie:flow.cookie})).headers.get('location'),/auth_error=state/);assert.equal(exchangesCount,before);
  const noCookie=await begin();assert.match((await call('/api/auth/callback/google?state='+noCookie.url.searchParams.get('state')+'&code=x')).headers.get('location'),/auth_error=state/);
  for(const claims of [{nonce:'wrong'},{email_verified:false},{iss:'https://attacker.invalid'},{aud:'another-client'},{exp:Math.floor(Date.now()/1000)-60},{iat:Math.floor(Date.now()/1000)-1200}]) { const invalid=await finish(await begin(),'invalid@example.invalid','google-invalid',claims);assert.match(invalid.response.headers.get('location'),/auth_error=google/); }
  const wrongKey=await generateKeyPair('RS256');const forged=await finish(await begin(),'forged@example.invalid','google-forged',{},wrongKey.privateKey);assert.match(forged.response.headers.get('location'),/auth_error=google/);
  assert.equal((await call('/api/auth/google',{site:'https://untrusted.invalid'})).status,403);
  const alternate=await login('alternate@example.invalid','google-alternate','https://21st-ark.dev');assert.ok(alternate);
  console.log('Features passed: preserved migrations; Google OAuth/JWT/PKCE; roles/admin/profile; full database search/pagination/topic counts/writers; account-private persistent bookmarks and idempotent likes; draft privacy, ownership, revisions, R2 and both domains.');
} finally { await mf.dispose(); }
