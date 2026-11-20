import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://21st-ark.dev',redirect='https://client.example.org/callback',hash=value=>createHash('sha256').update(value).digest('hex');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=','base64');
let imageFetches=0,githubIdentity={id:900,name:'owner',email:'owner@example.invalid'};
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../apps/backend/dist/index.js',import.meta.url)),compatibilityDate:'2026-11-10',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:{DB:'mcp-test'},r2Buckets:['MEDIA'],bindings:{GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',AUTH_ORIGINS:origin},outboundService:async request=>{
  const url=new URL(request.url);
  if(url.href==='https://github.com/login/oauth/access_token')return Response.json({access_token:'test-github-token',token_type:'bearer'});
  if(url.href==='https://api.github.com/user')return Response.json({id:githubIdentity.id,name:githubIdentity.name});
  if(url.pathname==='/user/emails')return Response.json([{email:githubIdentity.email,primary:true,verified:true}]);
  if(url.href==='https://images.example.org/test.png'){imageFetches++;assert(!request.headers.has('Cookie'));assert(!request.headers.has('Authorization'));return new Response(image,{headers:{'Content-Type':'image/png'}});}
  if(url.href==='https://images.example.org/private'){return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/secret'}});}
  if(url.href==='https://images.example.org/svg')return new Response('<svg onload="alert(1)"/>',{headers:{'Content-Type':'image/svg+xml'}});
  if(url.href==='https://client.example.org/mcp.json')return Response.json({client_id:url.href,client_name:'Metadata client',redirect_uris:[redirect],token_endpoint_auth_method:'none'},{headers:{'Cache-Control':'max-age=60'}});
  return new Response('unexpected external fetch',{status:500});
}}));
try{
 const db=await mf.getD1Database('DB'),cookies={};
 for(const file of (await readdir(new URL('../apps/backend/migrations',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../apps/backend/migrations/'+file,import.meta.url),'utf8')).split(';').filter(sql=>sql.trim()))await db.prepare(sql).run();
 for(const [id,role] of [['owner','author'],['other','author'],['reader','reader'],['web-author','author'],['web-admin','admin'],['web-disabled','author']]){
  await db.prepare('INSERT INTO auth_users(id,email,name,role,username,username_key,username_confirmed) VALUES(?,?,?,?,?,?,1)').bind(id,id+'@example.invalid',id,role,'Mcp'+id,'mcp'+id).run();
  const token=randomBytes(32).toString('hex');cookies[id]='__Host-ark_session='+token;await db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,last_seen) VALUES(?,?,?,unixepoch())').bind(hash(token),id,Math.floor(Date.now()/1000)+3600).run();
 }
 const call=(path,{method='GET',body,actor,cookie='',token,type='application/json',headers={},...rest}={})=>mf.dispatchFetch(origin+path,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':type,...((actor||cookie)?{Cookie:[actor?cookies[actor]:'',cookie].filter(Boolean).join('; ')}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}),...rest});
 const expect=async(response,status)=>{assert.equal(response.status,status,(await response.clone().text()).slice(0,1500));return response;};
 const form=(path,fields)=>call(path,{method:'POST',type:'application/x-www-form-urlencoded',body:new URLSearchParams(fields).toString()});
 const webForm={title:'Permission check',summary:'Isolated fixture',body:'Permission check body',category:'tech',body_format:'markdown'};
 await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='web-disabled'").run();
 for(const status of ['draft','published'])for(const [actor,expected] of [[undefined,401],['reader',403],['web-disabled',401]])await expect(await call('/api/posts',{method:'POST',actor,body:{...webForm,status,role:'admin',author_id:'owner'}}),expected);
 for(const actor of ['web-author','web-admin']){
  const created=await (await expect(await call('/api/posts',{method:'POST',actor,body:{...webForm,status:'published',author_id:'owner'}}),201)).json();assert.equal(created.post.author_id,actor,'Client-supplied owner cannot impersonate another author');
  for(const method of ['PUT','DELETE'])await expect(await call('/api/posts/'+created.post.id,{method,actor:'reader',body:{...webForm,status:'published',revision:1,role:'admin'}}),403);
  await expect(await call('/api/posts/'+created.post.id,{method:'PUT',actor:'other',body:{...webForm,status:'published',revision:1}}),403,'An author cannot modify another author’s post');
  await db.prepare('DELETE FROM posts WHERE id=?').bind(created.post.id).run();
 }
 const metadata=await (await expect(await call('/.well-known/oauth-authorization-server'),200)).json();assert.equal(metadata.authorization_endpoint,origin+'/oauth/authorize');assert.equal(metadata.token_endpoint,origin+'/oauth/token');assert(metadata.code_challenge_methods_supported.includes('S256'));assert(!metadata.scopes_supported.includes('posts:publish'));
 const challenge=await expect(await call('/mcp',{method:'POST',body:{jsonrpc:'2.0',id:1,method:'tools/list'}}),401);assert.match(challenge.headers.get('WWW-Authenticate'),/oauth-protected-resource\/mcp/);
 assert.equal((await (await call('/.well-known/oauth-protected-resource/mcp')).json()).resource,origin+'/mcp');
 const registered=await (await expect(await call('/oauth/register',{method:'POST',body:{client_name:'Integration test',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']}}),201)).json();
 const client=registered.client_id;assert(client);
 async function begin({clientId=client,scopes='account:read posts:read posts:write analytics:read offline_access',redirectUri=redirect,challengeMethod='S256'}={}){
  const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const response=await call('/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:scopes,state:'state-test',code_challenge:challenge,code_challenge_method:challengeMethod,resource:origin+'/mcp'}));
  if(response.status!==303)return {response};
  const location=new URL(response.headers.get('Location'));
  return {response,verifier,clientId,flow:location.searchParams.get('request'),cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')};
 }
 async function connect(actor='owner',options={}){
  const flow=await begin(options);await expect(flow.response,303);
  const details=await (await expect(await call('/api/mcp/authorization/'+flow.flow,{actor,cookie:flow.cookie}),200)).json();assert.equal(details.user.id,actor);
  const approved=await (await expect(await call('/api/mcp/authorization/'+flow.flow,{method:'POST',actor,cookie:flow.cookie,body:{approve:true,user_id:actor,scopes:options.granted??options.scopes?.split(' ')??['account:read','posts:read','posts:write','analytics:read','offline_access']}}),200)).json();
  const back=new URL(approved.redirect);assert.equal(back.searchParams.get('state'),'state-test');assert.equal(back.searchParams.get('iss'),origin);
  const fields={grant_type:'authorization_code',client_id:flow.clientId,redirect_uri:redirect,code:back.searchParams.get('code'),code_verifier:flow.verifier,resource:origin+'/mcp'};
  const tokens=await (await expect(await form('/oauth/token',fields),200)).json();assert(tokens.access_token);return {...flow,tokens,fields};
 }
 const missing=await begin({redirectUri:'https://evil.example.org/callback'});assert.notEqual(missing.response.headers.get('Location')?.startsWith('https://evil.example.org'),true,'Invalid redirect must never be followed');
 assert.equal((await begin({challengeMethod:'plain'})).response.status,303,'Provider redirects validated request errors safely');
 const beforeSwitch=await connect('owner',{scopes:'account:read',granted:['account:read']});
 const loginFlow=await begin();
 await db.prepare("INSERT INTO auth_github_accounts(subject,user_id) VALUES('900','owner')").run();
 const loginStart=await call('/api/auth/github?origin='+encodeURIComponent(origin)+'&mcp_request='+loginFlow.flow,{cookie:loginFlow.cookie}),loginState=new URL(loginStart.headers.get('Location')).searchParams.get('state');
 const loginCookies=loginStart.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const callback=await call('/api/auth/callback/github?'+new URLSearchParams({state:loginState,code:'test-code'}),{cookie:loginFlow.cookie+'; '+loginCookies});
 assert.equal(new URL(callback.headers.get('Location')).pathname,'/connect');assert.equal(new URL(callback.headers.get('Location')).searchParams.get('request'),loginFlow.flow);assert.equal(new URL(callback.headers.get('Location')).searchParams.get('auth'),'success','MCP sign-in returns to consent, ordinary sign-in still returns home');
 const switchPath='/api/mcp/authorization/'+loginFlow.flow,oldBrowserSession=callback.headers.getSetCookie().find(value=>value.startsWith('__Host-ark_session=')).split(';')[0],oldBrowserCookie=loginFlow.cookie+'; '+oldBrowserSession;
 await expect(await call(switchPath,{cookie:oldBrowserSession,method:'POST',body:{action:'switch_account',user_id:'owner'}}),410,'Switch requires the original browser-bound flow');
 await expect(await call(switchPath,{cookie:oldBrowserCookie,method:'POST',headers:{Origin:'https://evil.example.org'},body:{action:'switch_account',user_id:'owner'}}),403);
 await expect(await call(switchPath,{cookie:oldBrowserCookie,method:'POST',body:{action:'switch_account',user_id:'reader'}}),409,'Stale identity must not log out a different account');
 assert.equal((await (await call('/api/auth/me',{cookie:oldBrowserSession})).json()).user.id,'owner');
 const connectionCount=(await db.prepare('SELECT count(*) AS n FROM mcp_connections').first()).n;
 const switched=await expect(await call(switchPath,{cookie:oldBrowserCookie,method:'POST',body:{action:'switch_account',user_id:'owner'}}),200);assert(switched.headers.getSetCookie().some(value=>value.startsWith('__Host-ark_session=;')&&value.includes('Max-Age=0')));assert(!switched.headers.getSetCookie().some(value=>value.includes('mcp_')),'Switch preserves pending consent cookie');
 assert.equal((await (await call('/api/auth/me',{cookie:oldBrowserSession})).json()).user,null,'Old browser session cannot be replayed');assert.equal((await (await call('/api/auth/me',{actor:'owner'})).json()).user.id,'owner','Other browser sessions are preserved');
 assert.equal((await (await call(switchPath,{cookie:oldBrowserCookie})).json()).user,null);await expect(await call(switchPath,{cookie:oldBrowserCookie,method:'POST',body:{approve:true,user_id:'owner',scopes:['account:read']}}),401);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM mcp_connections').first()).n,connectionCount,'Switch alone creates no grant');
 await expect(await call('/mcp',{method:'POST',token:beforeSwitch.tokens.access_token,headers:{Accept:'application/json, text/event-stream'},body:{jsonrpc:'2.0',id:900,method:'tools/list'}}),200,'Existing MCP connection remains active after browser account switch');
 githubIdentity={id:901,name:'reader',email:'reader@example.invalid'};await db.prepare("INSERT INTO auth_github_accounts(subject,user_id) VALUES('901','reader')").run();
 const nextStart=await call('/api/auth/github?origin='+encodeURIComponent(origin)+'&mcp_request='+loginFlow.flow,{cookie:loginFlow.cookie});
 const nextCallback=await call('/api/auth/callback/github?'+new URLSearchParams({state:new URL(nextStart.headers.get('Location')).searchParams.get('state'),code:'reader-code'}),{cookie:loginFlow.cookie+'; '+nextStart.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')});
 assert.equal(new URL(nextCallback.headers.get('Location')).searchParams.get('request'),loginFlow.flow);
 const nextCookie=loginFlow.cookie+'; '+nextCallback.headers.getSetCookie().find(value=>value.startsWith('__Host-ark_session=')).split(';')[0],nextConsent=await (await expect(await call(switchPath,{cookie:nextCookie}),200)).json();assert.equal(nextConsent.user.id,'reader');assert.deepEqual(nextConsent.available_scopes,['account:read','offline_access']);
 await expect(await call(switchPath,{cookie:nextCookie,method:'POST',body:{approve:true,user_id:'reader',scopes:['account:read','posts:write']}}),400,'Old author scopes cannot follow the switched reader');
 const nextDecision=await (await expect(await call(switchPath,{cookie:nextCookie,method:'POST',body:{approve:true,user_id:'reader',scopes:['account:read']}}),200)).json();
 const switchedTokens=await (await expect(await form('/oauth/token',{grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code:new URL(nextDecision.redirect).searchParams.get('code'),code_verifier:loginFlow.verifier,resource:origin+'/mcp'}),200)).json();assert.equal(switchedTokens.scope,'account:read');
 assert.equal((await db.prepare('SELECT user_id FROM mcp_connections ORDER BY rowid DESC LIMIT 1').first()).user_id,'reader');githubIdentity={id:900,name:'owner',email:'owner@example.invalid'};
 const ordinaryStart=await call('/api/auth/github?origin='+encodeURIComponent(origin),{cookie:loginFlow.cookie}),ordinaryState=new URL(ordinaryStart.headers.get('Location')).searchParams.get('state');
 const ordinaryCallback=await call('/api/auth/callback/github?'+new URLSearchParams({state:ordinaryState,code:'ordinary-code'}),{cookie:loginFlow.cookie+'; '+ordinaryStart.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')});assert.equal(new URL(ordinaryCallback.headers.get('Location')).pathname,'/','Pending MCP flows do not capture unrelated website sign-in');
 const pending=await begin();await expect(await call('/api/mcp/authorization/'+pending.flow,{actor:'owner'}),410);
 await expect(await call('/api/mcp/authorization/'+pending.flow,{actor:'owner',cookie:pending.cookie,method:'POST',headers:{Origin:'https://evil.example.org'},body:{approve:true,user_id:'owner',scopes:['account:read']}}),403);
 await expect(await call('/api/mcp/authorization/'+pending.flow,{actor:'other',cookie:pending.cookie,method:'POST',body:{approve:true,user_id:'owner',scopes:['account:read']}}),400,'Account switch cannot authorize a different account silently');
 await expect(await call('/api/mcp/authorization/'+pending.flow,{cookie:pending.cookie,method:'POST',body:{approve:false}}),200,'Deny does not require sign-in');
 await expect(await call('/api/mcp/authorization/'+pending.flow,{cookie:pending.cookie}),410);
 const expired=await begin();await db.prepare('UPDATE mcp_flows SET expires_at=0 WHERE id=?').bind(expired.flow).run();await expect(await call('/api/mcp/authorization/'+expired.flow,{cookie:expired.cookie}),410);
 await expect(await call('/api/mcp/authorization/'+expired.flow,{actor:'owner',cookie:expired.cookie,method:'POST',body:{action:'switch_account',user_id:'owner'}}),410);assert.equal((await (await call('/api/auth/me',{actor:'owner'})).json()).user.id,'owner','Expired flow cannot log out a browser');
 const cimd=await connect('owner',{clientId:'https://client.example.org/mcp.json',scopes:'account:read',granted:['account:read']});assert(!cimd.tokens.refresh_token,'Refresh tokens require offline_access consent');
 const main=await connect();
 const nativeClient=new Client({name:'SDK integration',version:'1.0.0'});
 const nativeTransport=new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+main.tokens.access_token}},fetch:async(input,init)=>{const request=new Request(input,init);return mf.dispatchFetch(request.url,{method:request.method,redirect:'manual',headers:Object.fromEntries(request.headers),...(request.body?{body:await request.arrayBuffer()}:{})});}});
 await nativeClient.connect(nativeTransport);assert((await nativeClient.listTools()).tools.some(tool=>tool.name==='create_draft'));assert(!(await nativeClient.callTool({name:'get_writing_guide',arguments:{}})).isError,'Official MCP client negotiates and calls the server');await nativeClient.close();
 // Protocol 2025 clients use initialize; modern clients are served by the same SDK factory.
 let rpcId=0;
 async function rpc(method,params={},token=main.tokens.access_token){
  const response=await expect(await call('/mcp',{method:'POST',token,body:{jsonrpc:'2.0',id:++rpcId,method,params},headers:{Accept:'application/json, text/event-stream'}}),200);
  const text=await response.text();return response.headers.get('Content-Type')?.includes('text/event-stream')?JSON.parse(text.split('\n').filter(line=>line.startsWith('data: ')).at(-1).slice(6)):JSON.parse(text);
 }
 async function tool(name,args={},token){const reply=await rpc('tools/call',{name,arguments:args},token);assert(!reply.error,JSON.stringify(reply));return reply.result;}
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'integration',version:'1'}});assert.equal(init.result.serverInfo.name,'21st-ark');
 const tools=(await rpc('tools/list')).result.tools;assert(tools.some(t=>t.name==='upload_image'));assert(tools.some(t=>t.name==='create_draft'));assert(tools.every(t=>!/publish|delete/.test(t.name)),'No publish/delete tools exist');
 const account=await tool('get_account');assert.equal(account.structuredContent.user.id,'owner');assert(!JSON.stringify(account).includes('password_hash'));
 assert.equal((await tool('get_categories')).isError,undefined);
 const guide=(await tool('get_writing_guide')).structuredContent;assert(guide.examples.video.includes('영상 임베드'));
 const imageResult=await tool('upload_image',{request_key:'image-0001',base64:image.toString('base64'),content_type:'image/png',alt:'검증 이미지'});assert(!imageResult.isError,JSON.stringify(imageResult));
 const media=imageResult.structuredContent;assert.match(media.image_key,/^posts\/owner\//);assert.equal((await call(media.source)).status,404,'Unattached image stays private');
 const remote=await tool('upload_image',{request_key:'image-remote-001',image_url:'https://images.example.org/test.png',alt:'원격 이미지'});assert(!remote.isError,JSON.stringify(remote));assert.equal(imageFetches,1);
 await tool('upload_image',{request_key:'image-remote-001',image_url:'https://images.example.org/test.png',alt:'원격 이미지'});assert.equal(imageFetches,1,'Image retry does not fetch/upload twice');
 await db.prepare("UPDATE mcp_operations SET result=NULL WHERE request_key='image-remote-001'").run();await tool('upload_image',{request_key:'image-remote-001',image_url:'https://images.example.org/test.png',alt:'원격 이미지'});assert.equal(imageFetches,1,'Recover an upload after its response/result record was interrupted');
 for(const image_url of ['https://127.0.0.1/x','https://[::1]/x','https://example.internal/x','http://images.example.org/test.png','https://name:password@images.example.org/x','https://images.example.org/private','https://images.example.org/svg'])assert((await tool('upload_image',{request_key:'bad-image-'+rpcId,image_url})).isError,image_url);
 const label=(await tool('create_label',{kind:'tag',name:'MCP'})).structuredContent.label;
 const draft={request_key:'draft-create-0001',title:'MCP Markdown draft',summary:'검증용 초안',category:'tech',topic_ids:['frontend'],writer_tag_ids:[label.id],image_key:media.image_key,body:'# 제목\n\n**굵게** [사이트](https://example.com)\n\n'+media.markdown+'\n\n'+guide.examples.video+'\n\n'+guide.examples.table+'\n\n'+guide.examples.code};
 const saved=await tool('create_draft',draft);assert(!saved.isError,JSON.stringify(saved));const post=saved.structuredContent.post;assert.equal(post.status,'draft');assert.equal(post.body_format,'markdown');assert(post.body.includes(media.markdown));assert(post.body.includes('영상 임베드'));assert(saved.structuredContent.editor_url.includes('/write?post='+post.id));
 const retried=await tool('create_draft',draft);assert.equal(retried.structuredContent.post.id,post.id);assert.equal((await db.prepare('SELECT count(*) AS n FROM posts WHERE author_id=?').bind('owner').first()).n,1);
 assert((await tool('create_draft',{...draft,title:'Changed payload'})).isError,'Idempotency key cannot select different content');
 assert((await tool('create_draft',{...draft,request_key:'draft-inject-001',status:'published'})).isError,'Unknown status cannot bypass draft policy');
 await expect(await call('/api/posts/'+post.id),404);
 const edit={...draft,request_key:'draft-update-0001',post_id:post.id,revision:post.revision,title:'수정된 초안'};
 const updated=await tool('update_draft',edit);assert(!updated.isError,JSON.stringify(updated));assert.equal(updated.structuredContent.post.revision,post.revision+1);
 assert.equal((await tool('update_draft',edit)).structuredContent.post.revision,post.revision+1);
 await db.prepare("UPDATE mcp_operations SET result=NULL WHERE request_key='draft-update-0001'").run();assert.equal((await tool('update_draft',edit)).structuredContent.post.revision,post.revision+1,'Recover an interrupted response without applying the edit twice');
 assert((await tool('update_draft',{...edit,request_key:'stale-update-001'})).isError,'Revision conflict protects concurrent human edits');
 const drafts=(await tool('list_posts',{status:'draft'})).structuredContent;assert.equal(drafts.total,1);assert.equal(drafts.posts[0].id,post.id);
 assert.equal((await tool('list_posts',{status:'published'})).structuredContent.total,0);
 const other=await connect('other');assert((await tool('get_post',{post_id:post.id},other.tokens.access_token)).isError,'Other authors cannot read a draft');assert((await tool('update_draft',{...edit,request_key:'other-update-001'},other.tokens.access_token)).isError);
 // Only the human browser route can publish, and normal revision/media/taxonomy checks still apply.
 const published=await (await expect(await call('/api/posts/'+post.id,{actor:'owner',method:'PUT',body:{...draft,revision:post.revision+1,status:'published',body_format:'markdown'}}),200)).json();assert.equal(published.post.status,'published');
 assert.equal((await call('/api/posts/'+post.id)).status,200);assert.equal((await call(media.source)).status,200);
 assert((await tool('update_draft',{...edit,revision:published.post.revision,request_key:'edit-public-001'})).isError,'Published content is immutable via MCP');
 await expect(await call('/api/posts/'+post.id,{method:'PUT',token:main.tokens.access_token,body:{...draft,status:'published',revision:published.post.revision}}),401,'MCP token is never a browser session');
 assert.equal((await tool('get_analytics')).structuredContent.owner_id,'owner');
 const adminConnection=await connect('web-admin');assert((await tool('get_post',{post_id:post.id},adminConnection.tokens.access_token)).isError,'MCP administrator is still restricted to their own data');
 await db.prepare("UPDATE auth_users SET role='reader' WHERE id='owner'").run();
 for(const [name,args] of [['create_draft',{...draft,request_key:'role-demoted-001'}],['upload_image',{request_key:'role-demoted-image',base64:image.toString('base64'),content_type:'image/png'}]]){const denied=await tool(name,args);assert(denied.isError);assert.equal(JSON.parse(denied.content[0].text).status,403,'Existing write consent cannot override a downgraded account role');}
 await expect(await call('/api/posts',{method:'POST',actor:'owner',body:{...webForm,status:'published'}}),403);
 await db.prepare("UPDATE auth_users SET role='author' WHERE id='owner'").run();
 const readerFlow=await begin();const readerDetails=await (await call('/api/mcp/authorization/'+readerFlow.flow,{actor:'reader',cookie:readerFlow.cookie})).json();assert(!readerDetails.available_scopes.includes('posts:write'));
 await expect(await call('/api/mcp/authorization/'+readerFlow.flow,{method:'POST',actor:'reader',cookie:readerFlow.cookie,body:{approve:true,user_id:'reader',scopes:['account:read','posts:write']}}),400,'Reader cannot forge a write-scope consent');

 const low=await connect('reader',{scopes:'account:read offline_access',granted:['account:read','offline_access']});const forbidden=await call('/mcp',{method:'POST',token:low.tokens.access_token,headers:{Accept:'application/json, text/event-stream'},body:{jsonrpc:'2.0',id:99,method:'tools/call',params:{name:'create_draft',arguments:draft}}});assert.equal(forbidden.status,403);assert.match(forbidden.headers.get('WWW-Authenticate'),/insufficient_scope/);
 const refresh=await (await expect(await form('/oauth/token',{grant_type:'refresh_token',client_id:client,refresh_token:main.tokens.refresh_token,resource:origin+'/mcp'}),200)).json();assert.notEqual(refresh.access_token,main.tokens.access_token);assert.notEqual(refresh.refresh_token,main.tokens.refresh_token);
 assert.equal((await tool('get_account',{},refresh.access_token)).structuredContent.user.id,'owner');
 const isolated=await connect('owner');await expect(await form('/oauth/token',{...isolated.fields,resource:'https://evil.example.org/mcp'}),400);
 // Replaying a valid code must fail (and the provider revokes the affected grant).
 await expect(await form('/oauth/token',isolated.fields),400);
 const concurrent=await connect('owner');const racing=await Promise.all([1,2].map(()=>form('/oauth/token',{grant_type:'refresh_token',client_id:client,refresh_token:concurrent.tokens.refresh_token})));assert(racing.some(response=>response.status===200));assert(racing.every(response=>[200,503].includes(response.status)),'Concurrent requests either serialize or fail retryably');
 await db.prepare("INSERT INTO mcp_locks(key,token,expires_at) VALUES('oauth-provider','test-held-lock',unixepoch()+60)").run();const held=await form('/oauth/token',{grant_type:'refresh_token',client_id:client,refresh_token:concurrent.tokens.refresh_token});assert.equal(held.status,503);assert.equal(held.headers.get('Retry-After'),'3');await db.prepare("DELETE FROM mcp_locks WHERE token='test-held-lock'").run();
 const connections=(await (await call('/api/mcp/connections',{actor:'owner'})).json());assert(connections.activity.some(event=>event.tool==='create_draft'));assert(connections.connections.every(row=>!('grant_id' in row)));assert(!JSON.stringify(connections).includes(main.tokens.access_token));
 const connection=connections.connections.find(row=>row.active);await expect(await call('/api/mcp/connections/'+connection.id,{actor:'other',method:'DELETE',body:{}}),404);
 const revokeTokens=await racing.find(response=>response.status===200).json();
 await expect(await call('/mcp',{method:'POST',token:revokeTokens.access_token,body:{jsonrpc:'2.0',id:90,method:'tools/list'},headers:{Accept:'application/json, text/event-stream'}}),200);
 const mainConnection=await db.prepare('SELECT id FROM mcp_connections WHERE grant_id=?').bind(revokeTokens.access_token.split(':')[1]).first();
 await expect(await call('/api/mcp/connections/'+mainConnection.id,{actor:'owner',method:'DELETE',body:{}}),200);
 await expect(await call('/mcp',{method:'POST',token:revokeTokens.access_token,body:{jsonrpc:'2.0',id:91,method:'tools/list'}}),401);
 await expect(await form('/oauth/token',{grant_type:'refresh_token',client_id:client,refresh_token:revokeTokens.refresh_token}),400);
 const beforeDisable=await connect('other');await db.prepare("UPDATE auth_users SET disabled=1 WHERE id='other'").run();await expect(await call('/mcp',{method:'POST',token:beforeDisable.tokens.access_token,body:{jsonrpc:'2.0',id:92,method:'tools/list'}}),401);
 const previousAuthorization=await connect();const beforeVersion=await connect('owner',{scopes:'account:read offline_access',granted:['account:read','offline_access']});await expect(await call('/mcp',{method:'POST',token:previousAuthorization.tokens.access_token,body:{jsonrpc:'2.0',id:97,method:'tools/list'}}),401,'Reauthorizing with fewer scopes revokes the previous broader grant');assert.equal((await tool('get_account',{},beforeVersion.tokens.access_token)).structuredContent.user.id,'owner');await db.prepare("UPDATE auth_users SET login_version=login_version+1 WHERE id='owner'").run();await expect(await call('/mcp',{method:'POST',token:beforeVersion.tokens.access_token,body:{jsonrpc:'2.0',id:93,method:'tools/list'}}),401);
 await expect(await call('/mcp',{method:'POST',token:low.tokens.access_token,headers:{Origin:'https://evil.example.org'},body:{jsonrpc:'2.0',id:94,method:'tools/list'}}),403);
 const allStorage=JSON.stringify((await db.prepare('SELECT value FROM mcp_oauth_storage').all()).results);assert(!allStorage.includes(low.tokens.access_token));assert(!allStorage.includes(low.tokens.refresh_token));
 await db.prepare("DELETE FROM auth_users WHERE id='reader'").run();assert.equal((await db.prepare("SELECT count(*) AS n FROM mcp_connections WHERE user_id='reader'").first()).n,0);assert.equal((await db.prepare("SELECT count(*) AS n FROM mcp_oauth_storage WHERE user_id='reader'").first()).n,0);
 console.log('MCP passed: OAuth discovery/DCR/PKCE/consent, CSRF/browser/account binding, account switch with session revocation, preserved flow and new-account sign-in/consent, private scoped tools, Markdown/media/embed drafts, SSRF and invalid image rejection, idempotency/revisions, human-only publication, refresh rotation/code replay, ownership, immediate revoke, suspension/login-version invalidation, hashed/encrypted token storage and account deletion cleanup.');
}finally{await mf.dispose();}
