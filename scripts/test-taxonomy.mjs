import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21stark.dev';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'taxonomy-test'},r2Buckets:['MEDIA']}));
try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql','0007_post_reads.sql','0008_github_login.sql','0009_writer_taxonomy.sql','0010_post_comments.sql','0011_signup_consent.sql','0012_writer_applications.sql','0013_account_controls.sql']){const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(value=>value.trim()))await db.prepare(statement).run();}
  const cookies={};for(const [id,role] of [['alice','author'],['bob','author'],['admin','admin'],['reader','reader']]){await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+3600).run();cookies[id]='__Host-ark_session='+token;}
  const call=(path,{actor,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const create=async(writer,kind,name,actor=writer)=>{const response=await call('/api/writers/'+writer+'/taxonomy',{actor,method:'POST',body:{kind,name}});assert.ok([200,201].includes(response.status));return (await response.json()).label;};
  const catalog=async(writer,actor,manage=false)=>(await call('/api/writers/'+writer+'/taxonomy'+(manage?'?scope=manage':''),{actor})).json();
  assert.equal((await call('/api/writers/alice/taxonomy?scope=manage')).status,401);assert.equal((await call('/api/writers/alice/taxonomy?scope=manage',{actor:'bob'})).status,403);assert.equal((await call('/api/writers/alice/taxonomy?scope=manage',{actor:'admin'})).status,200);
  for(const actor of [undefined,'reader','bob','admin'])assert.equal((await call('/api/writers/alice/taxonomy',{actor,method:'POST',body:{kind:'tag',name:'untrusted'}})).status,actor?403:401);
  assert.equal((await call('/api/writers/alice/taxonomy',{actor:'alice',method:'POST',csrf:'https://attacker.invalid',body:{kind:'tag',name:'bad'}})).status,403);
  const category=await create('alice','category','  개발 노트  '),tag=await create('alice','tag','#React'),bobCategory=await create('bob','category','개발 노트'),bobTag=await create('bob','tag','React'),secondCategory=await create('alice','category','읽은 책');
  assert.equal(category.name,'개발 노트');assert.notEqual(category.id,bobCategory.id);assert.notEqual(tag.id,bobTag.id);assert.equal((await create('alice','tag','# react ')).id,tag.id,'Case-insensitive duplicate is reused within one writer');
  const privateCatalog=await catalog('alice','alice',true);assert.equal(privateCatalog.categories.length,2);assert.equal(privateCatalog.tags.length,1);assert.deepEqual((await catalog('alice')).categories,[]);assert.deepEqual((await catalog('alice')).tags,[]);
  for(const body of [{kind:'bad',name:'name'},{kind:'category',name:' '},{kind:'tag',name:'x'.repeat(31)},{kind:'category',name:'x'.repeat(41)}])assert.equal((await call('/api/writers/alice/taxonomy',{actor:'alice',method:'POST',body})).status,400);
  const form={title:'개인 분류를 가진 글',summary:'소개',body:'본문',category:'tech',topic_ids:['tech','frontend'],image_key:null,status:'draft',writer_category_id:category.id,writer_tag_ids:[tag.id]};
  const postResponse=await call('/api/posts',{actor:'alice',method:'POST',body:form});assert.equal(postResponse.status,201);let post=(await postResponse.json()).post;
  assert.equal(post.writer_category.id,category.id);assert.equal(post.writer_category.name,'개발 노트');assert.deepEqual(post.writer_tags.map(value=>value.id),[tag.id]);assert.equal('taxonomy_write_token' in post,false);assert.equal('writer_category_json' in post,false);
  assert.equal((await call('/api/posts/'+post.id)).status,404);assert.deepEqual((await catalog('alice')).tags,[],'Draft-only tags stay out of public taxonomy');
  assert.equal((await call('/api/posts',{actor:'alice',method:'POST',body:{...form,writer_category_id:bobCategory.id}})).status,400);assert.equal((await call('/api/posts',{actor:'alice',method:'POST',body:{...form,writer_tag_ids:[bobTag.id]}})).status,400);assert.equal((await call('/api/posts',{actor:'alice',method:'POST',body:{...form,writer_tag_ids:Array(11).fill(tag.id)}})).status,400);
  const publish=await call('/api/posts/'+post.id,{actor:'alice',method:'PUT',body:{...form,status:'published',revision:post.revision}});assert.equal(publish.status,200);post=(await publish.json()).post;
  let publicCatalog=await catalog('alice');assert.equal(publicCatalog.categories[0].post_count,1);assert.equal(publicCatalog.tags[0].post_count,1);assert.ok(!JSON.stringify(publicCatalog).includes('@'));
  const find=async(params)=>(await (await call('/api/posts?'+new URLSearchParams(params))).json());
  assert.equal((await find({author:'alice',writer_category:category.id})).total,1);assert.equal((await find({author:'alice',writer_tag:tag.id})).total,1);assert.equal((await find({author:'alice',writer_category:category.id,writer_tag:tag.id})).total,1);assert.equal((await find({author:'bob',writer_tag:tag.id})).total,0);assert.equal((await call('/api/posts?writer_tag='+tag.id)).status,400);
  assert.equal((await (await call('/api/writers?q=React')).json()).writers[0].id,'alice');
  assert.equal((await find({q:'개발 노트'})).total,1);assert.equal((await find({q:'React'})).total,1);assert.equal((await find({topic:'frontend'})).total,1,'Global taxonomy stays independent');
  assert.equal((await call('/api/writers/alice/taxonomy/'+tag.id,{actor:'bob',method:'PATCH',body:{name:'stolen'}})).status,403);assert.equal((await call('/api/writers/alice/taxonomy/'+tag.id,{actor:'admin',method:'DELETE'})).status,403);
  assert.equal((await call('/api/writers/alice/taxonomy/'+tag.id,{actor:'alice',method:'PATCH',body:{name:'React 기록'}})).status,200);assert.equal((await (await call('/api/posts/'+post.id)).json()).post.writer_tags[0].name,'React 기록');
  assert.equal((await call('/api/writers/alice/taxonomy/'+secondCategory.id,{actor:'alice',method:'PATCH',body:{name:'개발 노트'}})).status,409);
  const preserved={title:form.title,summary:form.summary,body:form.body,category:form.category,topic_ids:form.topic_ids,image_key:null,status:'published',revision:post.revision};
  const kept=await call('/api/posts/'+post.id,{actor:'admin',method:'PUT',body:preserved});assert.equal(kept.status,200);post=(await kept.json()).post;assert.equal(post.writer_category.id,category.id);assert.equal(post.writer_tags[0].id,tag.id,'Legacy edits preserve missing taxonomy fields');
  assert.equal((await call('/api/posts/'+post.id,{actor:'alice',method:'PUT',body:{...form,status:'published',revision:post.revision-1,writer_category_id:secondCategory.id,writer_tag_ids:[]}})).status,409);
  const afterConflict=(await (await call('/api/posts/'+post.id)).json()).post;assert.equal(afterConflict.writer_category.id,category.id);assert.equal(afterConflict.writer_tags[0].id,tag.id,'Stale updates cannot mutate taxonomy');
  await assert.rejects(()=>db.prepare('INSERT INTO post_writer_labels(post_id,label_id,writer_id,kind) VALUES(?,?,?,?)').bind(post.id,bobTag.id,'alice','tag').run(),'Database constraints reject another writer label');
  await assert.rejects(()=>db.prepare('INSERT INTO post_writer_labels(post_id,label_id,writer_id,kind) VALUES(?,?,?,?)').bind(post.id,secondCategory.id,'alice','category').run(),'Database allows one personal category per post');
  assert.equal((await call('/api/writers/alice/taxonomy/'+category.id,{actor:'alice',method:'DELETE'})).status,200);const withoutCategory=(await (await call('/api/posts/'+post.id)).json()).post;assert.equal(withoutCategory.writer_category,null);assert.equal(withoutCategory.writer_tags.length,1);assert.equal(withoutCategory.category,'tech');
  const clear=await call('/api/posts/'+post.id,{actor:'alice',method:'PUT',body:{...preserved,revision:post.revision,writer_category_id:null,writer_tag_ids:[]}});assert.equal(clear.status,200);post=(await clear.json()).post;assert.equal(post.writer_category,null);assert.deepEqual(post.writer_tags,[]);assert.deepEqual((await catalog('alice')).tags,[]);
  assert.equal((await call('/api/posts/'+post.id,{actor:'alice',method:'DELETE',body:{revision:post.revision}})).status,200);assert.equal((await db.prepare('SELECT count(*) AS n FROM post_writer_labels WHERE post_id=?').bind(post.id).first()).n,0);
  await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='alice'").run();assert.equal((await call('/api/writers/alice/taxonomy')).status,404);
  console.log('Writer taxonomy passed: per-writer names, category/tag creation and rename/removal, draft privacy, ownership and database constraints, public counts and filters, global taxonomy independence, search, legacy edits and atomic stale-update protection.');
}finally{await mf.dispose();}
