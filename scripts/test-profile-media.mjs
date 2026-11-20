import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {animatedGif} from './fixtures/gif.mjs';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'profile-media-test'},r2Buckets:['MEDIA']}));
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA'),cookies={};
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role]of [['owner','author'],['other','reader']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,role,username,username_key,username_confirmed) VALUES(?,?,?,?,?,?,1)').bind(id,id+'@example.invalid',id,role,'Gif'+id,'gif'+id).run();await db.prepare('INSERT INTO username_aliases(username_key,username,user_id) VALUES(?,?,?)').bind('gif'+id,'Gif'+id,id).run();
  const token=randomBytes(32).toString('hex');cookies[id]='__Host-ark_session='+token;await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(createHash('sha256').update(token).digest('hex'),id,Math.floor(Date.now()/1000)+3600).run();
 }
 const call=(path,{actor,method='GET',body,type='application/json',csrf=origin}={})=>mf.dispatchFetch(origin+path,{method,headers:{Origin:csrf,'Content-Type':type,...(actor?{Cookie:cookies[actor]}:{})},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
 const gif=animatedGif(),upload=(purpose,data=gif,options={})=>call('/api/media?purpose='+purpose,{actor:'owner',method:'POST',body:data,type:'image/gif',...options});
 const {gifInfo}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../shared/gif.ts',import.meta.url)).replaceAll('\\','/'));
 assert.deepEqual(gifInfo(gif),{width:1,height:1,frames:2});
 assert.equal((await upload('avatar',gif,{actor:undefined})).status,401);assert.equal((await upload('avatar',gif,{csrf:'https://attacker.invalid'})).status,403);
 const keys={};for(const purpose of ['avatar','cover']){const response=await upload(purpose);assert.equal(response.status,201);const record=await response.json();keys[purpose]=record.key;assert.match(record.key,new RegExp('^profiles/owner/'+purpose+'-.*\\.gif$'));assert.deepEqual(new Uint8Array(await (await bucket.get(record.key)).arrayBuffer()),gif,'R2 preserves all original animation bytes');assert.equal((await call(record.url)).status,404,'Unattached upload is private');const own=await call(record.url,{actor:'owner'});assert.equal(own.headers.get('Content-Type'),'image/gif');assert.equal(own.headers.get('X-Content-Type-Options'),'nosniff');}
 assert.equal((await upload('avatar',gif,{type:'image/png'})).status,415);assert.equal((await upload('post')).status,415,'GIF support is scoped to profile photos and covers');
 const truncated=gif.slice(0,-1),trailing=new Uint8Array([...gif,...Buffer.from('<script>alert(1)</script>')]);
 for(const data of [truncated,trailing,new Uint8Array(Buffer.from('<svg onload="alert(1)"></svg>'))])assert.equal((await upload('avatar',data)).status,415,'Invalid or disguised files cannot enter R2');
 for(const data of [animatedGif({width:8193}),animatedGif({frames:301}),animatedGif({width:4000,height:4000,frames:4}),new Uint8Array(8*1024*1024+1)])assert.equal((await upload('cover',data)).status,413,'Size, canvas and animation workload limits precede storage');
 const bio='**개발자**\n\n- *프로필 소개*\n- [사이트](https://example.com)';
 const save=(actor,fields)=>call('/api/auth/profile',{actor,method:'PATCH',body:{name:actor,bio,version:0,...fields}});
 assert.equal((await save('other',{avatar_key:keys.avatar})).status,403,'GIF ownership is checked');assert.equal((await save('owner',{avatar_key:keys.cover})).status,403,'Avatar/cover purpose remains enforced');
 const saved=await save('owner',{avatar_key:keys.avatar,cover_key:keys.cover});assert.equal(saved.status,200);assert.equal((await saved.json()).user.bio,bio,'Store the editable Markdown source');
 const writer=(await (await call('/api/writers/owner')).json()).writer;assert.equal(writer.bio,bio);assert.equal(writer.avatar_url,'/api/media/'+keys.avatar);assert.equal(writer.cover_url,'/api/media/'+keys.cover);
 for(const url of [writer.avatar_url,writer.cover_url,'/api/social/writers/owner/image']){const response=await call(url);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/gif');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),gif);}
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='owner'").run();assert.equal((await call(writer.avatar_url)).status,404);assert.equal((await call('/api/social/writers/owner/image')).status,404);
 const {default:BioMarkdown,bioUrl}=await vite.ssrLoadModule('/src/BioMarkdown.jsx'),{plainBio}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../shared/bio.ts',import.meta.url)).replaceAll('\\','/'));
 const markup=renderToStaticMarkup(createElement(BioMarkdown,{value:bio}));assert(markup.includes('<strong>개발자</strong>'));assert(markup.includes('<em>프로필 소개</em>'));assert(markup.includes('<ul>'));assert(markup.includes('href="https://example.com/"'));assert(markup.includes('rel="noopener noreferrer"'));
 const hostile=renderToStaticMarkup(createElement(BioMarkdown,{value:'<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1)) ![tracking](https://example.com/pixel)'}));assert(!hostile.includes('<script'));assert(!hostile.includes('<img'));assert(!hostile.includes('href="javascript:'));for(const url of ['javascript:alert(1)','data:text/html,hi','vbscript:x','https://name:secret@example.com'])assert.equal(bioUrl(url),undefined);
 assert.equal(plainBio(bio),'개발자 프로필 소개 사이트');assert.equal(plainBio('foo_bar 개발자'),'foo_bar 개발자');
 console.log('Profile media passed: animated GIF byte preservation, MIME/signature/structure/size/frame/pixel limits, CSRF/roles/ownership, private/public/social delivery; Markdown persistence, formatting, plain excerpts and XSS/remote-image rejection.');
}finally{await mf.dispose();await vite.close();}
