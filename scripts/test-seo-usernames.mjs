import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'vite';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',time=Math.floor(Date.now()/1000);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'seo-usernames-test'},r2Buckets:['MEDIA']}));
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
  if(file==='0018_usernames.sql')await db.prepare("INSERT INTO auth_users(id,email,name,role) VALUES('legacy','legacy@example.invalid','기존 회원','reader')").run();
  for(const sql of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 }
 assert.equal((await db.prepare("SELECT username FROM auth_users WHERE id='legacy'").first()).username,'user-legacy');
 assert.equal((await db.prepare("SELECT username_confirmed FROM auth_users WHERE id='legacy'").first()).username_confirmed,0);
 const cookies={};
 for(const [id,role]of [['owner','author'],['other','author'],['reader','reader'],['numeric','reader']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,role) VALUES(?,?,?,?)').bind(id,id+'@example.invalid',id,role).run();
  const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,login_version,last_seen) VALUES(?,?,?,0,?)').bind(createHash('sha256').update(token).digest('hex'),id,time+3600,time).run();cookies[id]='__Host-ark_session='+token;
 }
 const call=(path,{actor,cookie,method='GET',body,csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':'application/json',...(cookie||actor?{Cookie:cookie??cookies[actor]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const profile=(actor,username,version=0)=>call('/api/auth/profile',{actor,method:'PATCH',body:{name:actor,bio:'공개 소개',username,version}});
 const claimed=await profile('owner','RyanSong');assert.equal(claimed.status,200);assert.equal((await claimed.json()).user.needs_username,false);
 assert.equal((await (await call('/api/auth/username-availability?username=ryansong')).json()).available,false);
 assert.equal((await (await call('/api/auth/username-availability?username=RyanSong',{actor:'owner'})).json()).available,true);
 for(const name of ['Ryan Song','api','user-someone','/admin','bad#name','x','_first','a'.repeat(51),'home','search','people','bookmark','write','my-posts','subscriptions','admin','ＨＯＭＥ','404','-first','123 name','123/name','123?x','123#x'])assert.equal((await call('/api/auth/username-availability?'+new URLSearchParams({username:name}))).status,400,name);
 assert.equal((await (await call('/api/auth/username-availability?'+new URLSearchParams({username:'ＲｙａｎＳｏｎｇ'}))).json()).available,false,'Unicode compatibility forms share the same namespace');
 for(const username of ['21st-ARK','123','2한글','１２３Name']){const response=await call('/api/auth/username-availability?'+new URLSearchParams({username}));assert.equal(response.status,200,username);assert.equal((await response.json()).available,true);}
 assert.equal((await profile('numeric','123Member')).status,200,'Numeric-leading usernames work in account settings');
 assert.equal((await profile('numeric','123New',1)).status,200,'Numeric-leading usernames can be renamed');

 assert.equal((await profile('other','RYANSONG')).status,409);
 assert.equal((await profile('owner','NeverClaimed',0)).status,409);assert.equal((await (await call('/api/auth/username-availability?username=NeverClaimed')).json()).available,true,'Failed stale profile writes never reserve a name');
 assert.equal((await profile('owner','RyanNew',1)).status,200);
 assert.equal((await profile('other','RyanSong')).status,409,'Old names stay reserved for redirect safety');
 assert.equal((await (await call('/api/writers/by-name/RyanSong')).json()).writer.username,'RyanNew');
 assert.equal((await profile('reader','QuietReader')).status,200);
 const ticket=async id=>{const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_pending_signups(token_hash,provider,subject,email,suggested_name,expires_at) VALUES(?,?,?,?,?,?)').bind(createHash('sha256').update(token).digest('hex'),'google',id,id+'@example.invalid','Suggested',time+1800).run();return '__Host-ark_signup='+token;};
 const legal=await (await call('/api/auth/legal')).json(),signup={name:'새 회원',terms:true,privacy:true,version:legal.version};
 const signupTicket=await ticket('new-member');assert.equal((await call('/api/auth/signup',{method:'POST',cookie:signupTicket,body:{...signup,username:'RyanSong'}})).status,409);const numericSignup=await call('/api/auth/signup',{method:'POST',cookie:signupTicket,body:{...signup,username:'21st-ARK'}});assert.equal(numericSignup.status,201,'Numeric-leading signup succeeds after a duplicate-name retry');assert.equal((await numericSignup.json()).user.username,'21st-ARK');
 for(const username of ['21ST-ark','２１ｓｔ-ＡＲＫ'])assert.equal((await(await call('/api/auth/username-availability?'+new URLSearchParams({username}))).json()).available,false,'Numeric names keep case-insensitive/NFKC duplicate protection');
 const a=await ticket('race-a'),b=await ticket('race-b'),races=await Promise.all([a,b].map(cookie=>call('/api/auth/signup',{method:'POST',cookie,body:{...signup,username:'SameName'}})));assert.deepEqual(races.map(r=>r.status).sort(),[201,409]);
 assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_users WHERE username_key='samename'").first()).n,1);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=','base64');
 await bucket.put('posts/owner/cover.png',png);await bucket.put('posts/owner/private.png',png);
 for(const [id,status,image,title]of [['published','published','cover.png','제목 "안내" </script><script>alert(1)</script>'],['draft','draft','private.png','PRIVATE DRAFT TITLE']])await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,body_format,body_doc,category,status,image_key,published_at) VALUES(?,'owner',?,'짧은 소개','검색할 수 있는 본문','markdown',?,'tech',?,?,?)").bind(id,title,JSON.stringify([{type:'paragraph',content:[{type:'text',text:'<script>unsafe</script> 검색 본문'}]}]),status,'posts/owner/'+image,time).run();
 const template=await readFile(new URL('../apps/frontend/index.html',import.meta.url),'utf8');
 const {default:worker}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../apps/frontend/worker.ts',import.meta.url)).replaceAll('\\','/'));
 const env={ASSETS:{fetch:async()=>new Response(template,{headers:{'Content-Type':'text/html'}})},API:{fetch:async request=>{assert(!request.headers.has('Cookie'),'Public rendering strips sessions');assert(!request.headers.has('Authorization'));return mf.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers)});}}};
 for(const username of ['21st-ARK','123New']){const response=await worker.fetch(new Request(origin+'/'+username),env);assert.equal(response.status,200);assert((await response.text()).includes('rel="canonical" href="'+origin+'/'+username+'"'));}
 const numericAlias=await worker.fetch(new Request(origin+'/123Member'),env);assert.equal(numericAlias.status,301);assert.equal(numericAlias.headers.get('Location'),origin+'/123New');
 const root=await worker.fetch(new Request(origin+'/?auth=success&source=legacy'),env);assert.equal(root.status,301);assert.equal(root.headers.get('Location'),origin+'/home?auth=success&source=legacy','Root redirect preserves OAuth return parameters');
 for(const path of ['/search?q=private-query','/bookmark','/write?post=draft','/my-posts','/subscriptions','/admin']){
  const privatePage=await worker.fetch(new Request(origin+path,{headers:{Cookie:cookies.owner}}),{...env,API:{fetch:async()=>{throw Error('App shell must not query account or public data');}}}),privateHtml=await privatePage.text();
  assert.equal(privatePage.status,200,path);assert.equal(privatePage.headers.get('X-Robots-Tag'),'noindex, nofollow',path);assert(privateHtml.includes('name="robots" content="noindex,nofollow"'));assert(!privateHtml.includes('PRIVATE DRAFT TITLE'));assert(!privateHtml.includes('owner@example.invalid'));assert(!privateHtml.includes('application/ld+json'));assert(privatePage.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));assert.equal(privatePage.headers.get('Cache-Control'),'private, no-store');
 }
 for(const path of ['/home','/people']){const response=await worker.fetch(new Request(origin+path),env),markup=await response.text();assert.equal(response.status,200);assert(markup.includes('rel="canonical" href="'+origin+path+'"'));assert(markup.includes('href="/RyanNew"'));assert(!markup.includes('PRIVATE DRAFT TITLE'));assert(!response.headers.has('X-Robots-Tag'));}
 const slash=await worker.fetch(new Request(origin+'/search/?q=keep-me'),env);assert.equal(slash.status,301);assert.equal(slash.headers.get('Location'),origin+'/search?q=keep-me');
 const page=await worker.fetch(new Request(origin+'/RyanNew/posts/published',{headers:{Cookie:cookies.owner}}),env),html=await page.text();assert.equal(page.status,200);assert(html.includes('property="og:image"'));assert(html.includes('/api/social/posts/published/image'));assert(html.includes('name="twitter:card" content="summary_large_image"'));assert(html.includes('검색 본문'));assert(html.includes('href="/RyanNew"'));assert(!html.includes('<script>alert(1)</script>'));assert(!html.includes('<script>unsafe</script>'));assert(!html.includes('owner@example.invalid'));assert(page.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));assert.equal(page.headers.get('Cache-Control'),'private, no-store');
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(schema['@type'],'BlogPosting');assert.equal(schema.author.url,origin+'/RyanNew');
 const changed=await worker.fetch(new Request(origin+'/RyanSong/posts/published'),env);assert.equal(changed.status,301);assert.equal(changed.headers.get('location'),origin+'/RyanNew/posts/published');
 const alias=await worker.fetch(new Request(origin+'/RyanSong'),env);assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),origin+'/RyanNew');
 const draft=await worker.fetch(new Request(origin+'/RyanNew/posts/draft',{headers:{Cookie:cookies.owner}}),env);assert.equal(draft.status,404);assert(!((await draft.text()).includes('PRIVATE DRAFT TITLE')));assert.equal(draft.headers.get('X-Robots-Tag'),'noindex, nofollow');
 const readerProfile=await worker.fetch(new Request(origin+'/QuietReader'),env);assert.equal(readerProfile.status,200,'Reader profiles are public without author privileges or a session');const readerHtml=await readerProfile.text();assert(readerHtml.includes('ProfilePage'));assert(readerHtml.includes('공개 소개'));assert(!readerHtml.includes('reader@example.invalid'));assert(!readerHtml.includes('PRIVATE DRAFT TITLE'));
 const profileHtml=await (await worker.fetch(new Request(origin+'/RyanNew'),env)).text();assert(profileHtml.includes('href="/RyanNew/posts/published"'));assert(!profileHtml.includes('PRIVATE DRAFT TITLE'));assert(profileHtml.includes('ProfilePage'));
 const image=await worker.fetch(new Request(origin+'/api/social/posts/published/image'),{...env,API:{fetch:req=>mf.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers)})}});assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(image.headers.get('Cross-Origin-Resource-Policy'),'cross-origin');
 assert.equal((await call('/api/social/posts/draft/image',{actor:'owner'})).status,404);
 assert.equal((await call('/api/seo/page?post_id=draft',{actor:'owner'})).status,404);
 const sitemap=await (await worker.fetch(new Request(origin+'/sitemap.xml'),env)).text();assert(sitemap.includes('/sitemaps/posts-0.xml'));const sitemapPosts=await (await worker.fetch(new Request(origin+'/sitemaps/posts-0.xml'),env)).text();assert(sitemapPosts.includes('/RyanNew/posts/published'));assert(!sitemapPosts.includes('/draft'));
 const sitemapWriters=await (await worker.fetch(new Request(origin+'/sitemaps/writers-0.xml'),env)).text();assert(sitemapWriters.includes('/QuietReader'),'Reader profiles appear in the public profile sitemap');
 const robots=await (await worker.fetch(new Request(origin+'/robots.txt'),env)).text();assert(robots.includes('Allow: /api/social/'));assert(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
 const head=await worker.fetch(new Request(origin+'/RyanNew/posts/published',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
 const menuSitemap=await (await worker.fetch(new Request(origin+'/sitemaps/pages.xml'),env)).text();assert(menuSitemap.includes(origin+'/home'));assert(menuSitemap.includes(origin+'/people'));assert(!menuSitemap.includes('/bookmark'));assert(!menuSitemap.includes('/write'));
 await db.prepare("UPDATE auth_users SET username='home',username_key='home' WHERE id='other'").run();await db.prepare("INSERT INTO username_aliases(username_key,username,user_id) VALUES('home','home','other')").run();
 await db.prepare("INSERT INTO posts(id,author_id,title,summary,body,category,status,published_at) VALUES('legacy-menu','other','기존 이름 포스트','소개','본문','tech','published',?)").bind(time).run();
 const existingMenuProfile=await worker.fetch(new Request(origin+'/@home'),env),existingMenuHtml=await existingMenuProfile.text();assert.equal(existingMenuProfile.status,200);assert(existingMenuHtml.includes('href="/@home/posts/legacy-menu"'));
 const existingMenuPost=await worker.fetch(new Request(origin+'/@home/posts/legacy-menu'),env),existingPostHtml=await existingMenuPost.text();assert.equal(existingMenuPost.status,200);assert(existingPostHtml.includes('href="/@home"'));assert.equal(JSON.parse(existingPostHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).author.url,origin+'/@home');
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='owner'").run();assert.equal((await call('/api/seo/page?post_id=published')).status,404);assert.equal((await call('/api/social/posts/published/image')).status,404);assert(!JSON.stringify(await (await call('/api/seo/sitemap?kind=posts')).json()).includes('published'));
 console.log('SEO/usernames passed: numeric-leading signup/settings/URLs/aliases and case/NFKC duplicate protection; unique Unicode-normalized names, stale/concurrent claims, signup retry, reserved aliases; public-only SSR/OG/JSON-LD/images, HTML escaping, canonical redirects, anonymous rendering, private/draft/disabled protection, sitemaps and robots.');
}finally{await mf.dispose();await vite.close();}
