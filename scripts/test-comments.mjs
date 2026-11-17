import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21stark.dev';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'comments-test'},r2Buckets:['MEDIA']}));
try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql','0007_post_reads.sql','0008_github_login.sql','0009_writer_taxonomy.sql','0010_post_comments.sql','0011_signup_consent.sql','0012_writer_applications.sql','0013_account_controls.sql','0014_security_performance.sql','0015_media_references.sql','0016_session_inactivity.sql','0017_notices_reading_history.sql']){const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(value=>value.trim()))await db.prepare(statement).run();}
  const cookies={};for(const [id,role] of [['writer','author'],['reader','reader'],['other','reader'],['admin','admin']]){await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+3600).run();cookies[id]='__Host-ark_session='+token;}
  for(const [id,status] of [['published','published'],['draft','draft'],['another','published']])await db.prepare("INSERT INTO posts(id,author_id,title,body,summary,category,status,published_at) VALUES(?,'writer','글','본문','','tech',?,1000)").bind(id,status).run();
  const call=(path,{actor,method='GET',body,csrf=origin,type='application/json'}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':type,...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const endpoint='/api/posts/published/comments';
  const empty=await call(endpoint);assert.equal(empty.status,200);assert.match(empty.headers.get('Cache-Control'),/no-store/);assert.deepEqual(await empty.json(),{comments:[],total:0,next_cursor:null});
  for(const actor of [undefined,'writer','admin']){assert.equal((await call('/api/posts/draft/comments',{actor})).status,404);assert.equal((await call('/api/posts/draft/comments',{actor,method:'POST',body:{body:'private'}})).status,404);}
  assert.equal((await call('/api/posts/missing/comments')).status,404);assert.equal((await call(endpoint,{method:'POST',body:{body:'anonymous'}})).status,401);assert.equal((await call(endpoint,{actor:'reader',method:'POST',body:{body:'CSRF'},csrf:'https://attacker.invalid'})).status,403);
  for(const body of [{body:''},{body:'   '},{body:'a'.repeat(3001)},{body:1},{body:'bad\u0000content'}])assert.equal((await call(endpoint,{actor:'reader',method:'POST',body})).status,400);
  assert.equal((await call(endpoint,{actor:'reader',method:'POST',type:'text/plain',body:{body:'invalid type'}})).status,415);
  const raw='<script>alert("text only")</script>\n댓글';
  const created=await call(endpoint,{actor:'reader',method:'POST',body:{body:'  '+raw+'  ',author_id:'admin'}});assert.equal(created.status,201);let comment=(await created.json()).comment;
  assert.equal(comment.body,raw);assert.equal(comment.writer.id,'reader');assert.equal(comment.can_edit,true);assert.equal(comment.can_delete,true);assert.equal(comment.revision,1);assert.ok(!JSON.stringify(comment).includes('@'));assert.equal('role' in comment.writer,false);
  const publicComment=(await (await call(endpoint)).json()).comments[0];assert.equal(publicComment.can_edit,false);assert.equal(publicComment.can_delete,false);assert.equal(publicComment.body,raw);assert.equal((await (await call(endpoint,{actor:'admin'})).json()).comments[0].can_delete,true);
  const patch=(actor,revision,body='수정한 댓글')=>call(endpoint+'/'+comment.id,{actor,method:'PATCH',body:{body,revision}});
  const remove=(actor,revision=comment.revision)=>call(endpoint+'/'+comment.id,{actor,method:'DELETE',body:{revision}});
  assert.equal((await patch('other',1)).status,403);assert.equal((await patch('admin',1)).status,403,'Admins may moderate but not rewrite another user comment');assert.equal((await remove('writer')).status,403,'Post authors do not gain administrator moderation permissions');assert.equal((await remove('other')).status,403);assert.equal((await patch('reader','1')).status,400);assert.equal((await patch('reader',0)).status,400);
  const revised=await patch('reader',1);assert.equal(revised.status,200);comment=(await revised.json()).comment;assert.equal(comment.revision,2);assert.equal(comment.body,'수정한 댓글');assert.equal((await patch('reader',1,'old edit')).status,409);assert.equal((await remove('reader',1)).status,409);
  assert.equal((await call('/api/posts/another/comments/'+comment.id,{actor:'reader',method:'DELETE',body:{revision:2}})).status,404,'Comment IDs are scoped to their post');
  assert.equal((await call(endpoint+'/'+comment.id,{actor:'reader',method:'DELETE',csrf:'https://attacker.invalid',body:{revision:2}})).status,403);
  assert.equal((await remove('admin',2)).status,200);assert.equal((await remove('reader',2)).status,404);assert.equal((await (await call(endpoint)).json()).total,0);
  const long=await call(endpoint,{actor:'reader',method:'POST',body:{body:'가'.repeat(3000)}});assert.equal(long.status,201,'Full-length Korean comments fit the byte limit');const longId=(await long.json()).comment.id;assert.equal((await call(endpoint+'/'+longId,{actor:'reader',method:'DELETE',body:{revision:1}})).status,200);
  await db.batch(Array.from({length:25},(_,index)=>db.prepare('INSERT INTO post_comments(id,post_id,author_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('page-'+String(index).padStart(2,'0'),'published','reader','페이지 댓글 '+index,1000+Math.floor(index/3),1000+Math.floor(index/3))));
  const first=(await (await call(endpoint)).json());assert.equal(first.total,25);assert.equal(first.comments.length,20);assert.ok(first.next_cursor);const second=(await (await call(endpoint+'?cursor='+encodeURIComponent(first.next_cursor))).json());assert.equal(second.comments.length,5);assert.equal(second.next_cursor,null);assert.equal(new Set([...first.comments,...second.comments].map(row=>row.id)).size,25,'Cursor tie-breaking never duplicates or skips comments');
  assert.equal((await call(endpoint+'?cursor=invalid')).status,400);assert.equal((await call(endpoint,{actor:'reader',method:'PUT',body:{}})).status,405);
  await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='reader'").run();assert.equal((await (await call(endpoint)).json()).total,0,'Disabled commenters are excluded');assert.equal((await call(endpoint,{actor:'reader',method:'POST',body:{body:'blocked'}})).status,401);
  await db.prepare("UPDATE auth_users SET disabled=0 WHERE id='reader'").run();assert.equal((await (await call(endpoint)).json()).total,25);await db.prepare("UPDATE posts SET status='draft' WHERE id='published'").run();assert.equal((await call(endpoint)).status,404);assert.equal((await patch('reader',1)).status,404);
  await db.prepare("UPDATE posts SET status='published' WHERE id='published'").run();await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='writer'").run();assert.equal((await call(endpoint)).status,404);await db.prepare("UPDATE auth_users SET disabled=0 WHERE id='writer'").run();
  await db.prepare("DELETE FROM posts WHERE id='published'").run();assert.equal((await db.prepare("SELECT count(*) AS total FROM post_comments WHERE post_id='published'").first()).total,0,'Deleting a post cascades all comments');
  await db.prepare('DELETE FROM auth_login_limits WHERE key=?').bind(createHash('sha256').update('comments:other').digest('hex')).run();
  for(let index=0;index<60;index++)assert.equal((await call('/api/posts/another/comments',{actor:'other',method:'POST',body:{body:'빈도 검사 '+index}})).status,201);
  assert.equal((await call('/api/posts/another/comments',{actor:'other',method:'POST',body:{body:'over limit'}})).status,429);
  console.log('Comments passed: public reads, reader/author/admin permissions, plain text and Korean length, origin checks, ownership, cross-post isolation, revision conflicts, moderation, cursor pagination, disabled users, draft privacy, rate limits and deletion cascade.');
}finally{await mf.dispose();}
