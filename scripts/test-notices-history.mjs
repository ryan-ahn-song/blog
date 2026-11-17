import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',now=Math.floor(Date.now()/1000);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'notices-history-test'},r2Buckets:['MEDIA']}));
try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
  if(file==='0017_notices_reading_history.sql'){
   await db.prepare("INSERT INTO auth_users(id,email,name,role) VALUES('legacy','legacy@example.invalid','기존 필자','author')").run();
   await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category) VALUES('legacy-post','legacy','이전 포스트','','본문','tech')").run();
  }
  for(const statement of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 }
 assert.equal((await db.prepare("SELECT kind FROM posts WHERE id='legacy-post'").first()).kind,'post');
 const cookies={};
 for(const [id,role]of [['owner','author'],['other','author'],['reader','reader'],['reader2','reader']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();
  const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,login_version,last_seen) VALUES(?,?,?,0,?)').bind(createHash('sha256').update(token).digest('hex'),id,now+3600,now).run();cookies[id]='__Host-ark_session='+token;
 }
 const call=(path,{actor,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const form={title:'새 안내',summary:'공지 소개',body:'공지 본문',body_format:'markdown',category:'tech',status:'published',kind:'notice'};
 const created=await call('/api/posts',{actor:'owner',method:'POST',body:form});assert.equal(created.status,201);const notice=(await created.json()).post;assert.equal(notice.kind,'notice');
 const published=await call('/api/posts',{actor:'owner',method:'POST',body:{...form,title:'일반 포스트',kind:'post'}});assert.equal(published.status,201);const post=(await published.json()).post;
 assert.equal((await call('/api/posts',{actor:'reader',method:'POST',body:form})).status,403);
 for(const kind of ['unsafe',['notice'],null,{}])assert.equal((await call('/api/posts',{actor:'owner',method:'POST',body:{...form,kind}})).status,400);
 assert.equal((await call('/api/posts/'+notice.id,{actor:'other',method:'PUT',body:{...form,revision:notice.revision}})).status,403);
 let list=await (await call('/api/posts?author=owner')).json();assert.deepEqual(list.posts.map(p=>p.id),[post.id]);
 list=await (await call('/api/posts?author=owner&kind=notice')).json();assert.deepEqual(list.posts.map(p=>p.id),[notice.id]);assert(!('body' in list.posts[0]));
 assert.equal((await call('/api/posts?kind=invalid')).status,400);
 const writer=(await (await call('/api/writers/owner')).json()).writer;assert.equal(writer.post_count,1);assert.equal(writer.notice_count,1);
 assert.equal((await call('/api/posts/'+notice.id+'/bookmark',{actor:'reader',method:'PUT',body:{active:true}})).status,200);
 assert.equal((await (await call('/api/posts?bookmarked=1',{actor:'reader'})).json()).posts[0].kind,'notice','Saved posts include notices');
 await db.prepare('INSERT INTO post_reads(post_id,visitor_hash,read_day,first_seen,last_seen,views) VALUES(?,?,date(\'now\'),?,?,100)').bind(notice.id,'a'.repeat(64),now,now).run();
 assert.equal((await (await call('/api/trending')).json()).posts.length,0,'Notices remain separate from the general trending feed');
 const {kind,...legacyForm}=form;const updated=await call('/api/posts/'+notice.id,{actor:'owner',method:'PUT',body:{...legacyForm,revision:notice.revision}});assert.equal(updated.status,200);assert.equal((await updated.json()).post.kind,'notice','Older clients must preserve notice kind on edit');
 const draftResponse=await call('/api/posts',{actor:'owner',method:'POST',body:{...form,status:'draft'}});const draft=(await draftResponse.json()).post;assert.equal((await call('/api/posts/'+draft.id)).status,404);
 assert.equal((await call('/api/reading-history')).status,401);
 assert.equal((await call('/api/reading-history',{actor:'reader',method:'POST',body:{post_id:post.id},csrf:'https://attacker.invalid'})).status,403);
 assert.equal((await call('/api/reading-history',{actor:'reader',method:'POST',body:{post_id:draft.id}})).status,404);
 for(const id of [post.id,notice.id,post.id])assert.equal((await call('/api/reading-history',{actor:'reader',method:'POST',body:{post_id:id,user_id:'reader2'}})).status,200);
 let history=await (await call('/api/reading-history?user_id=reader2',{actor:'reader'})).json();assert.equal(history.posts.length,2);assert(!JSON.stringify(history).includes('user_id'));
 assert.equal((await (await call('/api/reading-history',{actor:'reader2'})).json()).posts.length,0,'Histories never cross accounts');
 assert.equal((await call('/api/reading-history',{actor:'owner',method:'POST',body:{post_id:post.id}})).status,200,'Own published posts also enter recent history');
 await db.prepare('UPDATE reading_history SET read_at=? WHERE user_id=? AND post_id=?').bind(now-10,'reader',notice.id).run();await db.prepare('UPDATE reading_history SET read_at=? WHERE user_id=? AND post_id=?').bind(now-20,'reader',post.id).run();await call('/api/reading-history',{actor:'reader',method:'POST',body:{post_id:post.id}});history=await (await call('/api/reading-history',{actor:'reader'})).json();assert.equal(history.posts[0].id,post.id);
 await db.prepare("UPDATE posts SET status='draft' WHERE id=?").bind(notice.id).run();assert.equal((await (await call('/api/reading-history',{actor:'reader'})).json()).posts.length,1);
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='owner'").run();assert.equal((await (await call('/api/reading-history',{actor:'reader'})).json()).posts.length,0);await db.prepare("UPDATE auth_users SET disabled=0 WHERE id='owner'").run();
 for(let i=0;i<55;i++){
  await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category,status,published_at) VALUES(?,'owner','포스트','','본문','tech','published',?)").bind('history-'+i,now).run();
  await db.prepare("INSERT INTO reading_history(user_id,post_id,read_at) VALUES('reader',?,?)").bind('history-'+i,now-i).run();
 }
 await call('/api/reading-history',{actor:'reader',method:'POST',body:{post_id:post.id}});assert.equal((await db.prepare("SELECT count(*) AS n FROM reading_history WHERE user_id='reader'").first()).n,50);
 assert.equal((await (await call('/api/reading-history',{actor:'reader'})).json()).posts.length,4);
 await db.prepare("UPDATE reading_history SET read_at=0 WHERE user_id='reader'").run();assert.equal((await (await call('/api/reading-history',{actor:'reader'})).json()).posts.length,0,'Expired entries are never exposed before cron cleanup');
 await db.prepare("DELETE FROM posts WHERE id=?").bind(post.id).run();assert.equal((await db.prepare('SELECT count(*) AS n FROM reading_history WHERE post_id=?').bind(post.id).first()).n,0);
 await db.prepare("DELETE FROM auth_users WHERE id='reader'").run();assert.equal((await db.prepare("SELECT count(*) AS n FROM reading_history WHERE user_id='reader'").first()).n,0);
 console.log('Notices/history passed: migration preservation; separate post/notice lists and counts, draft/privacy/ownership/revision-safe editing; authenticated recent reading with CSRF, account isolation, visibility, dedup, ordering, retention and cascade cleanup.');
}finally{await mf.dispose();}
