import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',time=Math.floor(Date.now()/1000);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'post-pins-test'},r2Buckets:['MEDIA']}));
try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 const cookies={};
 for(const [id,role]of [['admin','admin'],['author','author'],['reader','reader']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();
  const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,login_version,last_seen) VALUES(?,?,?,0,?)').bind(createHash('sha256').update(token).digest('hex'),id,time+3600,time).run();cookies[id]='__Host-ark_session='+token;
 }
 const call=(path,{actor,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 for(const id of ['top','middle','low','pin1','pin2','pin3','pin4','draft','notice'])await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category,status,published_at,kind) VALUES(?,'author',?,'소개','본문','tech',?,?,?)").bind(id,id,id==='draft'?'draft':'published',time-10,id==='notice'?'notice':'post').run();
 const today=new Date((time+9*3600)*1000).toISOString().slice(0,10);
 for(const [id,views]of [['top',100],['middle',50],['low',1]])await db.prepare('INSERT INTO post_reads(post_id,visitor_hash,read_day,first_seen,last_seen,views) VALUES(?,?,?,?,?,?)').bind(id,'a'.repeat(64),today,time,time,views).run();
 const trend=async()=>(await (await call('/api/trending')).json()).posts;
 const pin=(id,active=true,actor='admin',extra={})=>call('/api/posts/'+id+'/pin',{actor,method:'PUT',body:{active},...extra});
 assert.deepEqual((await trend()).map(p=>p.id),['top','middle','low']);
 for(const actor of [undefined,'reader','author'])assert.equal((await call('/api/posts/pin1/pin',{actor,method:'PUT',body:{active:true}})).status,actor?403:401);
 assert.equal((await pin('pin1',true,'admin',{csrf:'https://attacker.invalid'})).status,403);
 assert.equal((await call('/api/posts/pin1/pin',{actor:'admin',method:'POST',body:{active:true}})).status,405);
 assert.equal((await call('/api/posts/pin1/pin',{actor:'admin',method:'PUT',body:{active:'yes'}})).status,400);
 for(const id of ['draft','notice'])assert.equal((await pin(id)).status,400);
 assert.equal((await pin('missing')).status,404);
 assert.equal((await pin('pin1')).status,200);assert.equal((await pin('pin1')).status,200,'Pin is idempotent');
 assert.deepEqual((await trend()).map(p=>p.id),['pin1','top','middle'],'Zero-read pinned post precedes popular posts and total stays three');assert.equal((await trend())[0].pinned,true);
 assert.equal((await (await call('/api/posts/pin1')).json()).post.pinned,true);
 assert.equal((await (await call('/api/posts?author=author')).json()).posts.find(p=>p.id==='pin1').pinned,true);
 assert.equal(Boolean((await (await call('/api/author/dashboard?days=28',{actor:'author'})).json()).posts.find(p=>p.id==='pin1').pinned),true);
 // Pin ordering happens before LIMIT/OFFSET, not by sorting a single client page.
 for(let i=0;i<25;i++)await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category,status,published_at) VALUES(?,'author','새 포스트','','본문','life','published',?)").bind('new-'+i,time+i).run();
 const list=async(query)=>(await (await call('/api/posts?'+query)).json());
 const home=await list('pin_first=1'),homeNext=await list('pin_first=1&page=1');
 assert.equal(home.posts[0].id,'pin1','Old pinned post stays above newer posts on Home');assert.equal(home.posts[0].pinned,true);
 const homeIds=[...home.posts,...homeNext.posts].map(p=>p.id);assert.equal(new Set(homeIds).size,home.total,'Pagination never duplicates or loses pinned posts');
 assert.equal((await list('page=0')).posts[0].id,'new-24','Search/latest ordering is preserved');
 assert.equal((await list('author=author&pin_first=1')).posts[0].id,'new-24','Profile chronology is preserved');
 const filtered=await list('pin_first=1&category=life');assert(filtered.posts.every(p=>p.category==='life'));assert(!filtered.posts.some(p=>p.id==='pin1'),'Pins respect Home category filters');
 await db.prepare("DELETE FROM posts WHERE id LIKE 'new-%'").run();
 await pin('pin2');await db.prepare("UPDATE post_pins SET pinned_at=? WHERE post_id='pin1'").bind(time).run();await db.prepare("UPDATE post_pins SET pinned_at=? WHERE post_id='pin2'").bind(time+5).run();
 assert.deepEqual((await trend()).map(p=>p.id),['pin2','pin1','top']);
 const competing=await Promise.all([pin('pin3'),pin('pin4')]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409],'Concurrent pin requests cannot exceed three slots');
 assert.equal((await db.prepare('SELECT count(*) AS n FROM post_pins').first()).n,3);
 assert.equal((await pin('pin2',false)).status,200);assert.equal((await pin('pin2',false)).status,200);assert(!(await trend()).some(p=>p.id==='pin2'));
 // A stale editor cannot clear a pin; a successful unpublish does clear it atomically.
 const before=(await (await call('/api/posts/pin1')).json()).post;
 const form={title:before.title,summary:before.summary,body:before.body,category:before.category,body_format:'plain',status:'draft',revision:before.revision+1};
 assert.equal((await call('/api/posts/pin1',{actor:'author',method:'PUT',body:form})).status,409);assert.equal((await db.prepare("SELECT count(*) AS n FROM post_pins WHERE post_id='pin1'").first()).n,1);
 const saved=await call('/api/posts/pin1',{actor:'author',method:'PUT',body:{...form,revision:before.revision}});assert.equal(saved.status,200);assert.equal((await saved.json()).post.pinned,false);assert(!(await trend()).some(p=>p.id==='pin1'));
 await pin('pin2');await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='author'").run();assert.equal((await trend()).length,0,'Disabled accounts never surface pinned posts');await db.prepare("UPDATE auth_users SET disabled=0 WHERE id='author'").run();
 await db.prepare("DELETE FROM posts WHERE id='pin2'").run();assert.equal((await db.prepare("SELECT count(*) AS n FROM post_pins WHERE post_id='pin2'").first()).n,0);
 console.log('Post pins passed: admin-only/CSRF/method/body checks, public-only placement, zero-read inclusion, pin-first ordering, max-three concurrency, idempotency, listing/detail/dashboard state, stale-edit safety, unpublish cleanup, disabled-account privacy and delete cascade.');
}finally{await mf.dispose();}
