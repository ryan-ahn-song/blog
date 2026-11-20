import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',hash=value=>createHash('sha256').update(value).digest('hex');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'public-profiles-test'},r2Buckets:['MEDIA']}));
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA'),cookies={};
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(sql=>sql.trim()))await db.prepare(sql).run();
 for(const [id,role,username,name]of [['author','author','ActiveWriter','작성자'],['ordinary','reader','QuietReader','평범한 멤버'],['follower','reader','Follower','구독하는 멤버'],['blocked','reader','BlockedMember','정지 멤버']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,bio,role,username,username_key,username_confirmed,disabled) VALUES(?,?,?,?,?,?,?,1,?)').bind(id,id+'@example.invalid',name,'공개 소개',role,username,username.toLowerCase(),id==='blocked'?1:0).run();
  await db.prepare('INSERT INTO username_aliases(username_key,username,user_id) VALUES(?,?,?)').bind(username.toLowerCase(),username,id).run();
  const token=randomBytes(32).toString('hex');cookies[id]='__Host-ark_session='+token;await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,last_seen) VALUES(?,?,unixepoch()+3600,unixepoch())').bind(hash(token),id).run();
 }
 const call=(path,{actor,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const expect=async(response,status)=>{assert.equal(response.status,status,(await response.clone().text()).slice(0,900));return response;};
 await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,body_format,category,status) VALUES('private-draft','ordinary','PRIVATE DRAFT TITLE','PRIVATE SUMMARY','PRIVATE DRAFT BODY','plain','tech','draft')").run();
 const all=await(await expect(await call('/api/writers'),200)).json();assert.equal(all.total,3);assert.deepEqual(new Set(all.writers.map(w=>w.id)),new Set(['author','ordinary','follower']));assert(!JSON.stringify(all).includes('@example.invalid'));
 for(const q of ['평범한','quietreader','QUIETREADER']){const found=await(await expect(await call('/api/writers?'+new URLSearchParams({q})),200)).json();assert.equal(found.total,1);assert.equal(found.writers[0].id,'ordinary');assert.equal(found.writers[0].post_count,0);}
 assert.equal((await(await call('/api/writers?q=ordinary%40example.invalid')).json()).total,0,'Private login email is not searchable');
 for(const path of ['/api/writers/ordinary','/api/writers/by-name/QuietReader']){const profile=await(await expect(await call(path),200)).json();assert.equal(profile.writer.username,'QuietReader');assert.equal(profile.writer.post_count,0);assert.equal(profile.writer.notice_count,0);assert.equal(profile.writer.subscribed,false);for(const forbidden of ['email','role','password_hash','login_version','version'])assert(!(forbidden in profile.writer),'Private field '+forbidden);assert(!JSON.stringify(profile).includes('PRIVATE DRAFT'));}
 const taxonomy=await(await expect(await call('/api/writers/ordinary/taxonomy'),200)).json();assert.deepEqual(taxonomy.categories,[]);assert.deepEqual(taxonomy.tags,[]);
 await expect(await call('/api/writers/ordinary/taxonomy?scope=manage',{actor:'follower'}),403);
 await expect(await call('/api/writers/ordinary/taxonomy',{actor:'ordinary',method:'POST',body:{kind:'tag',name:'Disallowed'}}),403,'Public profiles do not grant taxonomy writing');
 const form={title:'Not authorized',body:'body',summary:'summary',category:'tech',body_format:'markdown',status:'published'};
 for(const status of ['draft','published'])await expect(await call('/api/posts',{actor:'ordinary',method:'POST',body:{...form,status}}),403,'Reader profile visibility does not grant author permission');
 const subscribe=(id,active,options={})=>call('/api/writers/'+id+'/subscription',{actor:'follower',method:'PUT',body:{active},...options});
 await expect(await subscribe('ordinary',true,{actor:undefined}),401);await expect(await subscribe('ordinary',true,{csrf:'https://attacker.invalid'}),403);await expect(await subscribe('ordinary',true,{actor:'ordinary'}),400);await expect(await subscribe('ordinary','yes'),400);
 for(let i=0;i<2;i++)assert.equal((await(await expect(await subscribe('ordinary',true),200)).json()).subscribed,true);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM writer_subscriptions WHERE subscriber_id='follower' AND writer_id='ordinary'").first()).n,1,'Reader-to-reader subscription is idempotent');
 assert.equal((await(await call('/api/writers/ordinary',{actor:'follower'})).json()).writer.subscribed,true);
 assert.equal((await(await call('/api/writers/ordinary')).json()).writer.subscribed,false,'Subscription state is account-private');
 const updates=await(await expect(await call('/api/subscriptions',{actor:'follower'}),200)).json();assert.equal(updates.total,1);assert.equal(updates.writers[0].id,'ordinary');assert.equal(updates.writers[0].latest_post,null);assert(!JSON.stringify(updates).includes('PRIVATE DRAFT'));
 assert.equal((await(await call('/api/posts?subscribed=1',{actor:'follower'})).json()).total,0,'A subscribed reader never exposes drafts');
 const seo=await(await expect(await call('/api/seo/page?username=QuietReader'),200)).json();assert.equal(seo.type,'writer');assert.equal(seo.username,'QuietReader');assert.equal(seo.posts.length,0);assert(!JSON.stringify(seo).includes('@example.invalid'));
 assert((await(await call('/api/seo/sitemap?kind=writers')).json()).pages.some(page=>page.path==='/QuietReader'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=','base64');await bucket.put('profiles/ordinary/avatar-attached.png',png);await bucket.put('profiles/ordinary/avatar-private.png',png);await db.prepare("UPDATE auth_users SET avatar_key='profiles/ordinary/avatar-attached.png' WHERE id='ordinary'").run();
 await expect(await call('/api/social/writers/ordinary/image'),200);await expect(await call('/api/media/profiles/ordinary/avatar-private.png'),404,'Unattached uploads remain private');
 await db.prepare("UPDATE auth_users SET role='author' WHERE id='ordinary'").run();assert.equal((await(await call('/api/subscriptions',{actor:'follower'})).json()).total,1,'Subscriptions survive a change in posting role');
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='ordinary'").run();
 for(const path of ['/api/writers/ordinary','/api/writers/by-name/QuietReader','/api/writers/ordinary/taxonomy','/api/seo/page?username=QuietReader','/api/social/writers/ordinary/image'])await expect(await call(path),404);
 assert.equal((await(await call('/api/writers?q=QuietReader')).json()).total,0);assert.equal((await(await call('/api/subscriptions',{actor:'follower'})).json()).total,0);await expect(await subscribe('ordinary',true),404);assert.equal((await(await subscribe('ordinary',false)).json()).subscribed,false,'Disabled accounts can still be unsubscribed');
 assert(!(await(await call('/api/seo/sitemap?kind=writers')).json()).pages.some(page=>page.path==='/QuietReader'));
 console.log('Public profiles passed: active readers searchable by name/handle, public ID/name/SEO/sitemap/image routes, reader-to-reader subscriptions and idempotency, private email/draft/media/subscription state, unchanged author/taxonomy guards, role changes and disabled-account exclusion.');
}finally{await mf.dispose();}
