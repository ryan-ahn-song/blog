import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21stark.dev',hash=value=>createHash('sha256').update(value).digest('hex'),now=Math.floor(Date.now()/1000);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'security-performance-test'},r2Buckets:['MEDIA']}));
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 const cookies={};
 async function session(id,fresh=false){const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,login_version,authenticated_at) SELECT ?,id,?,login_version,? FROM auth_users WHERE id=?').bind(hash(token),now+3600,fresh?now:0,id).run();cookies[id]='__Host-ark_session='+token;return cookies[id];}
 for(const [id,role]of [['owner','author'],['reader','reader'],['admin','admin'],['second-admin','admin']]){await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();await db.prepare('INSERT INTO auth_google_accounts(subject,user_id) VALUES(?,?)').bind(id,id).run();await db.prepare('INSERT INTO auth_github_accounts(subject,user_id) VALUES(?,?)').bind(id,id).run();await session(id);}
 const call=(path,{actor,method='GET',body,headers={},cookie}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie||actor?{Cookie:cookie??cookies[actor]}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)})});
 await db.prepare("UPDATE auth_sessions SET last_seen=?,created_at=? WHERE user_id='second-admin'").bind(now-31*86400,now-32*86400).run();assert.equal((await (await call('/api/auth/me',{actor:'second-admin'})).json()).user,null,'Persistent login still enforces the idle timeout on the server');
 await db.prepare("UPDATE auth_sessions SET last_seen=?,created_at=? WHERE user_id='second-admin'").bind(now,now-91*86400).run();assert.equal((await (await call('/api/auth/me',{actor:'second-admin'})).json()).user,null,'Activity cannot extend the absolute timeout');
 await db.prepare("UPDATE auth_sessions SET created_at=?,last_seen=? WHERE user_id='second-admin'").bind(now,now-301).run();assert.equal((await (await call('/api/auth/me',{actor:'second-admin'})).json()).user.id,'second-admin');assert.ok((await db.prepare("SELECT last_seen FROM auth_sessions WHERE user_id='second-admin'").first()).last_seen>=now);
 const unlink=actor=>call('/api/auth/connections/github',{actor,method:'DELETE',body:{}});
 assert.equal((await unlink('owner')).status,428,'Old sessions cannot change login methods');
 assert.equal((await call('/api/auth/account',{actor:'reader',method:'DELETE',body:{email:'reader@example.invalid'}})).status,428);
 const oldOwner=cookies.owner;await session('owner',true);
 const unlinked=await unlink('owner');assert.equal(unlinked.status,200);assert.equal((await (await call('/api/auth/me',{cookie:oldOwner})).json()).user,null,'All older sessions are invalidated');
 cookies.owner=unlinked.headers.get('set-cookie').match(/__Host-ark_session=[a-f0-9]{64}/)[0];
 assert.equal((await (await call('/api/auth/me',{actor:'owner'})).json()).user.id,'owner','The rotated session still works');
 assert.equal((await call('/api/auth/account',{actor:'owner',method:'DELETE',body:{email:'owner@example.invalid'}})).status,428,'A consumed proof is not reusable');
 const demote=await call('/api/admin/users/reader',{actor:'admin',method:'PATCH',body:{role:'author',disabled:false,version:0}});assert.equal(demote.status,200);assert.equal((await (await call('/api/auth/me',{actor:'reader'})).json()).user,null,'Role change revokes prior credentials');await session('reader');
 assert.equal((await call('/api/auth/profile',{actor:'owner',method:'PATCH',body:{name:'safe\u202Ename',bio:'',version:0}})).status,400);
 await db.prepare("INSERT INTO auth_pending_signups(token_hash,provider,subject,email,suggested_name,expires_at) VALUES('expired','google','expired','expired@example.invalid','expired',0)").run();
 await call('/api/auth/me');assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_pending_signups WHERE token_hash='expired'").first()).n,1,'Anonymous auth GET performs no cleanup write');
 const large='한'.repeat(70000),doc=JSON.stringify([{type:'paragraph',content:large}]);
 for(let i=0;i<20;i++)await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,body_format,body_doc,category,status,published_at) VALUES(?,'owner',?,'소개',?,'markdown',?,'tech','published',?)").bind('post-'+i,'제목 '+i,large,doc,now).run();
 const started=performance.now(),response=await call('/api/posts'),text=await response.text(),elapsed=performance.now()-started,list=JSON.parse(text);
 assert.equal(list.posts.length,20);for(const post of list.posts){assert.ok(!('body'in post));assert.ok(!('body_doc'in post));assert.ok(!('taxonomy_write_token'in post));assert.ok(post.excerpt.length<=240);assert.ok(post.reading_minutes>=1);}
 const detail=await (await call('/api/posts/post-0')).json();assert.equal(detail.post.body.length,70000);
 const previousBytes=Buffer.byteLength(JSON.stringify({posts:Array.from({length:20},()=>detail.post)}));const bytes=Buffer.byteLength(text);assert.ok(bytes<previousBytes/20,'Large list response is bounded and substantially smaller');
 console.log(JSON.stringify({list_bytes:bytes,previous_full_document_bytes:previousBytes,reduction_percent:Math.round((1-bytes/previousBytes)*10000)/100,local_list_ms:Math.round(elapsed*100)/100}));
 const plan=await db.prepare("EXPLAIN QUERY PLAN SELECT id FROM posts WHERE author_id='owner' AND status='published' ORDER BY published_at DESC,id LIMIT 20").all();assert.ok(JSON.stringify(plan.results).includes('posts_author_public'));
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='owner'").run();assert.equal((await call('/api/posts/post-0')).status,404);assert.equal((await (await call('/api/posts')).json()).posts.length,0);assert.equal((await call('/api/posts/post-0/like',{actor:'reader',method:'PUT',body:{active:true}})).status,404);await db.prepare("UPDATE auth_users SET disabled=0 WHERE id='owner'").run();
 const image='posts/owner/private.png';await bucket.put(image,'test',{httpMetadata:{contentType:'image/png'}});
 assert.equal((await call('/api/media/'+image)).status,404);assert.equal((await call('/api/media/'+image,{actor:'owner'})).status,200);await db.prepare("UPDATE posts SET image_key=? WHERE id='post-0'").bind(image).run();await db.prepare("INSERT INTO post_media(post_id,media_key) VALUES('post-0',?)").bind(image).run();assert.equal((await call('/api/media/'+image)).status,200);await db.prepare("UPDATE posts SET status='draft' WHERE id='post-0'").run();assert.equal((await call('/api/media/'+image)).status,404,'Unpublishing immediately removes public media access');
 await db.prepare("INSERT OR IGNORE INTO media_inventory(user_id) VALUES('reader')").run();await db.prepare("INSERT INTO media_uploads(key,user_id,bytes) VALUES('quota','reader',268435456)").run();
 const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hS0AAAAASUVORK5CYII=','base64'));
 assert.equal((await call('/api/media',{actor:'reader',method:'POST',body:png,headers:{'Content-Type':'image/png'}})).status,413,'Cumulative quota applies before R2 writes');
 const huge=png.slice();new DataView(huge.buffer).setUint32(16,100000);assert.equal((await call('/api/media',{actor:'owner',method:'POST',body:huge,headers:{'Content-Type':'image/png'}})).status,413,'Pixel bombs are rejected');
 // Resetting the visitor cookie does not avoid a trusted edge-IP bucket.
 const day=new Date((now+32400)*1000).toISOString().slice(0,10),ip='192.0.2.10';await db.prepare('INSERT INTO auth_login_limits(key,attempts,expires_at) VALUES(?,300,?)').bind(hash('read-edge:'+day+':'+ip),now+900).run();assert.equal((await call('/api/posts/post-1/view',{method:'POST',body:{},headers:{'CF-Connecting-IP':ip}})).status,429);
 await (await mf.getWorker()).scheduled({cron:'0 * * * *'});assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_pending_signups WHERE token_hash='expired'").first()).n,0);
 console.log('Security/performance passed: one-use recent authentication, session rotation/revocation, Unicode validation, read-only auth GET, private media transitions, bounded list DTO, quota, image pixel limits, edge read limits and index plan.');
}finally{await mf.dispose();}
