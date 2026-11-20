import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM,VirtualConsole} from 'jsdom';
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>{if(!error.message.includes('navigation'))throw error;});
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/connect?request=12345678-1234-1234-1234-123456789012',pretendToBeVisual:true,virtualConsole});
for(const key of ['window','document','location','history','navigator','localStorage','sessionStorage','HTMLElement','Event','MouseEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
const user={id:'owner',name:'MCP 필자',role:'author',version:1},scopes={'account:read':'내 계정 조회','posts:read':'내 포스트 조회','posts:write':'초안 작성','offline_access':'연결 유지'};
const connection={id:'connection-1',client_name:'외부 AI 앱',client_domain:'client.example.org',redirect_host:'client.example.org',scope:['account:read','posts:read','posts:write'],active:true,created_at:1795120000,expires_at:1797712000,last_used_at:1795120100};
let account=user,connections=[connection],decision=[],revoke=[],root,gate,fail=false;
globalThis.fetch=async(path,options={})=>{
 if(path==='/api/auth/me')return Response.json({user:account});
 if(path.startsWith('/api/mcp/authorization/')){
  if(options.method==='POST'){decision.push(JSON.parse(options.body));return Response.json({redirect:'https://client.example.org/callback?code=test'});}
  return Response.json({client:{clientName:'<script>alert(1)</script>',clientDomain:null,redirectHost:'localhost',redirectIsLoopback:true},user:account,scopes,available_scopes:account?Object.keys(scopes):[],requested_scopes:['account:read','posts:read','posts:write'],expires_at:1795120600});
 }
 if(path==='/api/mcp/connections')return Response.json({endpoint:'https://21st-ark.dev/mcp',scopes,connections,activity:[{id:1,tool:'create_draft',client_name:'외부 AI 앱',outcome:'ok',created_at:1795120100}]});
 if(path==='/api/mcp/connections/connection-1'&&options.method==='DELETE'){
  revoke.push(path);if(gate)await gate;if(fail)return Response.json({error:'잠시 후 다시 시도해 주세요.'},{status:503});connections=[{...connection,active:false,revoked_at:1795120200}];return Response.json({revoked:true});
 }
 if(path==='/api/auth/providers')return Response.json({google:true,github:true});
 throw new Error('Unexpected API call '+path);
};
const wait=async(predicate,message)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>5000)throw Error(message+' '+document.body.textContent.slice(0,2000));await new Promise(resolve=>setTimeout(resolve,20));}};
const click=selector=>{const element=document.querySelector(selector);assert(element,selector);element.click();};
async function mount(Component,props){root?.unmount();await new Promise(resolve=>setTimeout(resolve,20));root=createRoot(document.getElementById('root'));root.render(createElement(Component,props));}
try{
 const {default:Consent}=await vite.ssrLoadModule('/src/McpAuthorization.jsx'),{default:Connections}=await vite.ssrLoadModule('/src/McpConnections.jsx');
 await mount(Consent);await wait(()=>document.querySelector('.mcp-scope-list'),'Consent loads');
 assert(document.body.textContent.includes('<script>alert(1)</script>'));assert(!document.querySelector('script'),'Client metadata is rendered as text');assert(document.querySelector('.mcp-warning').textContent.includes('내 컴퓨터'));
 assert(document.querySelector('.mcp-human-only').textContent.includes('AI는 초안만 저장'));
 const checkboxes=[...document.querySelectorAll('.mcp-scope-list input')];assert(checkboxes[0].disabled);assert(checkboxes[0].checked);
 checkboxes[2].click();await new Promise(resolve=>setTimeout(resolve,20));click('.mcp-consent-actions .primary');await wait(()=>decision.length===1,'Approval submitted');assert.equal(decision[0].user_id,'owner');assert.equal(decision[0].approve,true);assert(!decision[0].scopes.includes('posts:write'),'Only checked scopes are granted');assert(decision[0].scopes.includes('account:read'));
 account=null;await mount(Consent);await wait(()=>document.querySelector('.mcp-consent-actions'),'Guest consent loads');assert(!document.querySelector('.mcp-scope-list'));click('.mcp-consent-actions button');await wait(()=>decision.length===2,'Guest can decline');assert.equal(decision[1].approve,false);
 account=user;let busy=[];await mount(Connections,{user,onBusy:value=>busy.push(value)});await wait(()=>document.querySelector('.mcp-connection'),'Connected apps load');
 assert(document.body.textContent.includes('https://21st-ark.dev/mcp'));assert(document.querySelector('.mcp-activity').textContent.includes('초안 생성'));
 click('.mcp-connection>.text-button');await wait(()=>document.querySelector('.mcp-revoke'),'Revoke requires confirmation');assert.equal(revoke.length,0);click('.mcp-revoke .pill');await wait(()=>!document.querySelector('.mcp-revoke'),'Cancel preserves connection');assert.equal(revoke.length,0);
 click('.mcp-connection>.text-button');await wait(()=>document.querySelector('.mcp-revoke'),'Confirm opens again');fail=true;click('.mcp-revoke .danger-outline');await wait(()=>document.querySelector('.auth-error'),'Failed revoke shows retryable error');assert(document.querySelector('.mcp-revoke'));
 fail=false;let release;gate=new Promise(resolve=>release=resolve);click('.mcp-revoke .danger-outline');await wait(()=>busy.at(-1)===true,'Pending protects settings');assert(document.querySelector('.mcp-revoke .danger-outline').disabled);release();gate=null;
 await wait(()=>!document.querySelector('.mcp-revoke')&&document.querySelector('.mcp-connection>div>span')?.textContent==='연결 해제됨','Revoked connection refreshes');assert.equal(busy.at(-1),false);
 const template='<!doctype html><html><head></head><body><div id="root"></div></body></html>',{default:worker}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../apps/frontend/worker.ts',import.meta.url)).replaceAll('\\','/'));
 let forwarded;const env={ASSETS:{fetch:async()=>new Response(template,{headers:{'Content-Type':'text/html'}})},API:{fetch:async request=>{forwarded=request;return Response.json({ok:true});}}};
 for(const path of ['/mcp','/oauth/token','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource/mcp']){const response=await worker.fetch(new Request('https://21st-ark.dev'+path),env);assert.equal(response.status,200);assert.equal(new URL(forwarded.url).pathname,path,'MCP/OAuth bypass profile SSR routing');}
 const consentPage=await worker.fetch(new Request('https://21st-ark.dev/connect?request=private-flow'),{...env,API:{fetch:async()=>{throw Error('Consent shell must not query public profile');}}});assert.equal(consentPage.status,200);assert.equal(consentPage.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(consentPage.headers.get('Cache-Control'),'private, no-store');assert(consentPage.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
 console.log('MCP UI passed: client metadata escaping, local callback warning, least privilege checkboxes, account-bound approval, guest decline; revoke confirmation/cancel/error/retry/pending and refresh, activity display; OAuth/MCP routing and private consent shell.');
}finally{root?.unmount();await vite.close();dom.window.close();}
