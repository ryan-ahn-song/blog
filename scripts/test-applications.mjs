import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21stark.dev';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'applications-test'},r2Buckets:['MEDIA']}));
try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0001_auth.sql','0002_google_roles_posts.sql','0003_live_content.sql','0004_writer_profiles.sql','0005_block_documents.sql','0006_writer_subscriptions.sql','0007_post_reads.sql','0008_github_login.sql','0009_writer_taxonomy.sql','0010_post_comments.sql','0011_signup_consent.sql','0012_writer_applications.sql','0013_account_controls.sql','0014_security_performance.sql','0015_media_references.sql','0016_session_inactivity.sql','0017_notices_reading_history.sql','0018_usernames.sql']){
    const sql=await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(value=>value.trim()))await db.prepare(statement).run();
  }
  const cookies={};
  for(const [id,role] of [['reader','reader'],['other','reader'],['blocked','reader'],['author','author'],['admin','admin'],['admin-two','admin']]){
    await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+3600).run();cookies[id]='__Host-ark_session='+token;
  }
  const call=(path,{actor,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const applicant='/api/writer-applications',queue='/api/admin/writer-applications';
  assert.equal((await call(applicant)).status,401);assert.equal((await call(queue,{actor:'reader'})).status,403);assert.equal((await call(queue,{actor:'author'})).status,403);
  const initial=await (await call(applicant,{actor:'reader'})).json();assert.deepEqual(initial.applications,[]);
  const good={introduction:'자기소개 <script>literal</script>',topic_ids:['tech','frontend'],plan:'프론트엔드 포스트를 작성합니다.',portfolio_url:'https://example.invalid/portfolio',consent:true,consent_version:initial.consent.version,display_name:'forged',email:'forged@example.invalid',role:'admin'};
  assert.equal((await call(applicant,{actor:'reader',method:'POST',body:good,csrf:'https://attacker.invalid'})).status,403);
  for(const override of [{consent:false},{consent:'true'},{consent_version:'old'},{introduction:''},{introduction:'a'.repeat(1001)},{plan:'a'.repeat(2001)},{plan:'bad\0'},{topic_ids:[]},{topic_ids:['unknown']},{portfolio_url:'javascript:alert(1)'},{portfolio_url:'https://user:secret@example.invalid'}])assert.equal((await call(applicant,{actor:'reader',method:'POST',body:{...good,...override}})).status,400);
  assert.equal((await call(applicant,{actor:'author',method:'POST',body:good})).status,403);
  const created=await call(applicant,{actor:'reader',method:'POST',body:good});assert.equal(created.status,201);const application=(await created.json()).application;
  assert.equal(application.display_name,'reader');assert.equal(application.email,'reader@example.invalid');assert.equal(application.status,'pending');assert.equal(application.decision_token,undefined);assert.equal(application.introduction,good.introduction);assert.equal(application.consent_version,initial.consent.version);
  assert.equal((await call(applicant,{actor:'reader',method:'POST',body:good})).status,409);
  assert.deepEqual((await (await call(applicant+'?user_id=reader',{actor:'other'})).json()).applications,[],'Applicants can only read their own submissions');
  const list=await (await call(queue,{actor:'admin'})).json();assert.equal(list.total,1);assert.equal(list.applications[0].id,application.id);
  assert.equal((await call(queue+'/'+application.id,{actor:'reader',method:'PATCH',body:{status:'approved',review_note:'',version:1}})).status,403);
  const review=(id,status,note,version=1,actor='admin')=>call(queue+'/'+id,{actor,method:'PATCH',body:{status,review_note:note,version}});
  assert.equal((await review(application.id,'rejected','')).status,400);
  assert.equal((await review(application.id,'approved','',99)).status,409);
  const approved=await review(application.id,'approved','환영합니다.');assert.equal(approved.status,200);
  assert.equal((await db.prepare("SELECT role FROM auth_users WHERE id='reader'").first()).role,'author');assert.equal((await db.prepare("SELECT version FROM auth_users WHERE id='reader'").first()).version,1);
  assert.equal((await review(application.id,'rejected','stale',1,'admin-two')).status,409);assert.equal((await review(application.id,'approved','',2)).status,409);
  assert.equal((await call(applicant,{actor:'reader'})).status,401,'Role approval invalidates the old session');await db.prepare("UPDATE auth_sessions SET login_version=(SELECT login_version FROM auth_users WHERE id=user_id) WHERE user_id='reader'").run();
  assert.equal((await (await call(applicant,{actor:'reader'})).json()).applications[0].status,'approved');
  assert.equal((await (await call(queue+'?status=pending',{actor:'admin'})).json()).total,0);assert.equal((await (await call(queue+'?status=approved',{actor:'admin'})).json()).total,1);
  const other=await (await call(applicant,{actor:'other',method:'POST',body:good})).json();assert.equal((await review(other.application.id,'rejected','작성 계획을 보완해 주세요.')).status,200);assert.equal((await db.prepare("SELECT role FROM auth_users WHERE id='other'").first()).role,'reader');
  const again=await call(applicant,{actor:'other',method:'POST',body:good});assert.equal(again.status,201);const next=(await again.json()).application;
  const pair=await Promise.all([review(next.id,'approved','',1,'admin'),review(next.id,'rejected','다른 검토',1,'admin-two')]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);await db.prepare("UPDATE auth_sessions SET login_version=(SELECT login_version FROM auth_users WHERE id=user_id) WHERE user_id='other'").run();const decided=(await (await call(applicant,{actor:'other'})).json()).applications.find(a=>a.id===next.id);assert.ok(['approved','rejected'].includes(decided.status));assert.equal((await db.prepare("SELECT role FROM auth_users WHERE id='other'").first()).role,decided.status==='approved'?'author':'reader');
  const blocked=(await (await call(applicant,{actor:'blocked',method:'POST',body:good})).json()).application;await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='blocked'").run();assert.equal((await review(blocked.id,'approved','')).status,409);assert.equal((await review(blocked.id,'rejected','계정 상태를 확인해 주세요.')).status,200);
  assert.equal((await call(queue+'?status=invalid',{actor:'admin'})).status,400);
  console.log('Writer applications passed: consent and input validation, verified account identity, CSRF, reader-only submissions, private history, duplicate prevention, admin queue, approval/role transaction, rejection/resubmission, stale and concurrent review conflicts, disabled account protection.');
}finally{await mf.dispose();}
