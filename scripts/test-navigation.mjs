import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';

// Exercise the real App, URL/history, auth and API effects in a DOM. The editor's
// third-party canvas is isolated; its loading/saving contract remains real.
const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/home',pretendToBeVisual:true});
for(const key of ['window','document','location','history','navigator','localStorage','sessionStorage','HTMLElement','Event','MouseEvent','PopStateEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom',plugins:[{name:'navigation-editor-contract',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/Editor.jsx'))return `export default function Editor({post,onDirty,onSaved}){return <div data-testid="editor"><span>{post?.title??'새 편집기'}</span><button onClick={()=>onDirty(true)}>변경하기</button><button onClick={()=>{onDirty(false);onSaved({...post,status:'draft'});}}>저장하기</button></div>}`;}}]});
const account={id:'owner',username:'Owner',name:'필자',role:'author',version:1},longName='가'.repeat(40),writer={id:'owner',username:'Owner',name:longName,bio:'긴 소개 '.repeat(30),post_count:1};
const post={id:'published',writer:{...writer,name:'필자'},title:'라우팅 확인 포스트',summary:'검색 결과',body:'공개 본문',body_format:'plain',status:'published',category:'tech',published_at:1794614400,created_at:1794614400,like_count:0,liked:false,saved:false};
const draft={...post,id:'edit-1',title:'편집 대상 초안',status:'draft'};
let currentUser=account,authGate=null,requests=[],root;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);requests.push(url.pathname+url.search);
 let data;
 if(url.pathname==='/api/auth/me'){if(authGate)await authGate;data={user:currentUser};}
 else if(url.pathname==='/api/topics')data={topics:[{id:'tech',name:'개발 · 기술'},{id:'infra',name:'인프라'}]};
 else if(url.pathname==='/api/trending'||url.pathname==='/api/reading-history')data={posts:[]};
 else if(url.pathname==='/api/subscriptions')data={writers:[writer]};
 else if(url.pathname==='/api/writers'||url.pathname.startsWith('/api/writers/by-name/'))data=url.pathname==='/api/writers'?{writers:[writer],total:1,page:0}:{writer};
 else if(url.pathname==='/api/writers/owner')data={writer:{...writer,notice_count:0},categories:[],tags:[]};
 else if(url.pathname==='/api/writers/owner/taxonomy')data={writer_id:'owner',categories:[],tags:[]};
 else if(url.pathname==='/api/author/dashboard')data={owner_id:'owner',summary:{readers:0,views:0,bookmarks:0,likes:0,total:0,published:0,drafts:0},series:Array.from({length:28},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),readers:0,views:0})),posts:[],total:0,generated_at:1794614400};
 else if(url.pathname==='/api/posts')data={posts:[post],total:1,page:0};
 else if(url.pathname==='/api/posts/edit-1')data={post:draft};
 else if(url.pathname==='/api/posts/published')data={post};
 else if(url.pathname.endsWith('/comments'))data={comments:[],total:0,page:0};
 else if(options.method&&options.method!=='GET')data={ok:true};
 else throw Error('Unexpected API call: '+url.pathname+url.search);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
const wait=async(predicate,message)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>7000)throw Error(message+'\n'+document.body.textContent.slice(0,1600));await new Promise(resolve=>setTimeout(resolve,20));}};
const click=selector=>{const target=document.querySelector(selector);assert(target,selector);target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));};
try{
 const {default:App}=await vite.ssrLoadModule('/src/App.jsx'),{clearApiCache,setApiScope}=await vite.ssrLoadModule('/src/api.js');
 const mount=async(path,user=account)=>{if(root){root.unmount();await new Promise(resolve=>setTimeout(resolve,30));}currentUser=user;requests=[];clearApiCache();setApiScope('navigation-test');sessionStorage.clear();history.replaceState(null,'',path);root=createRoot(document.getElementById('root'));root.render(createElement(App));};
 await mount('/home');await wait(()=>document.querySelector('.post'),'Home feed loads');
 for(const [view,path]of [['home','/home'],['search','/search'],['writers','/people'],['saved','/bookmark'],['write','/write'],['my-posts','/my-posts']])assert.equal(document.querySelector('.rail a[data-view="'+view+'"]').getAttribute('href'),path);
 const modified=new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});let nativeClick;const stopDefault=event=>{nativeClick=!event.defaultPrevented;event.preventDefault();};document.addEventListener('click',stopDefault,{once:true});document.querySelector('.rail a[data-view="search"]').dispatchEvent(modified);assert(nativeClick,'Modified clicks retain native new-tab behavior');assert.equal(location.pathname,'/home');
 click('.rail a[data-view="writers"]');await wait(()=>document.querySelector('.writer-card strong'),'People list loads');assert.equal(location.pathname,'/people');assert.equal(document.querySelector('.writer-card strong').textContent,'가'.repeat(16)+'…');assert.equal(document.querySelector('.writer-card strong').title,longName);assert.equal(document.querySelector('.update-writer').textContent,'가'.repeat(16)+'…');
 click('.rail a[data-view="search"]');await wait(()=>document.querySelector('#page-title').textContent==='검색','Search selected');assert.equal(location.pathname,'/search');
 const input=document.querySelector('#search');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'테스트');input.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(()=>new URLSearchParams(location.search).get('q')==='테스트','Search query enters URL');
 await wait(()=>requests.some(path=>path.includes('/api/posts?')&&decodeURIComponent(path).includes('q=테스트')),'Search API uses URL query');
 await wait(()=>document.querySelector('.explore-results [data-post]'),'Search result visible');click('.explore-results [data-post]');await wait(()=>document.querySelector('#reader-title'),'Reader opens');assert.equal(location.pathname,'/Owner/posts/published');
 history.back();await wait(()=>location.pathname==='/search'&&!document.querySelector('#reader-title'),'Back closes reader');assert.equal(document.querySelector('#search').value,'테스트');
 history.forward();await wait(()=>document.querySelector('#reader-title'),'Forward restores reader');
 click('.rail a[data-view="saved"]');await wait(()=>document.querySelector('#page-title').textContent==='저장한 포스트','Bookmark selected');assert.equal(location.pathname,'/bookmark');
 await mount('/search?q=reload&topic=infra');await wait(()=>requests.some(path=>path.includes('q=reload')&&path.includes('topic=infra')),'Cold search restores query and topic');assert.equal(document.querySelector('#search').value,'reload');assert.equal(document.querySelector('[data-explore-topic="infra"]').getAttribute('aria-pressed'),'true');
 await mount('/bookmark',null);await wait(()=>document.querySelector('#feed')?.textContent.includes('저장한 포스트를 계정에서'),'Guest stays at bookmark login state');assert.equal(location.pathname,'/bookmark');assert(!requests.some(path=>path.includes('bookmarked=1')),'No private bookmarks fetched before login');
 let release;authGate=new Promise(resolve=>release=resolve);await mount('/write?post=edit-1');await wait(()=>document.querySelector('#feed')?.textContent.includes('로그인 상태를 확인'),'Private route waits for auth');assert.equal(location.pathname,'/write');assert(!requests.includes('/api/posts/edit-1'));release();authGate=null;
 await wait(()=>document.querySelector('[data-testid="editor"]')?.textContent.includes(draft.title),'Direct edit URL loads selected draft after auth');assert.equal(location.search,'?post=edit-1');
 click('[data-testid="editor"] button');await new Promise(resolve=>setTimeout(resolve,30));let confirmCalls=0;window.confirm=()=>{confirmCalls++;return false;};click('.rail a[data-view="home"]');assert.equal(location.pathname,'/write','Dirty form can cancel navigation');assert(document.querySelector('[data-testid="editor"]'));
 history.back();await wait(()=>confirmCalls===2&&location.pathname==='/write','Browser Back can cancel leaving a dirty editor');assert(document.querySelector('[data-testid="editor"]')?.textContent.includes(draft.title));
 window.confirm=()=>true;click('.rail a[data-view="home"]');await wait(()=>document.querySelector('.post'),'Confirmed navigation leaves editor');history.back();await wait(()=>document.querySelector('[data-testid="editor"]'),'Back restores edit target');assert.equal(location.search,'?post=edit-1');
 click('[data-testid="editor"] button:nth-of-type(2)');await wait(()=>document.querySelector('#reader-title')?.textContent===draft.title,'Saved draft opens reader');assert.equal(location.pathname,'/Owner/posts/edit-1');history.back();await wait(()=>location.pathname==='/my-posts'&&!document.querySelector('#reader-title')&&document.querySelector('.dashboard-posts-empty'),'Save returns to management on Back');
 await mount('/write',null);await wait(()=>document.querySelector('#feed')?.textContent.includes('로그인이 필요'),'Direct editor route requires login');assert(!document.querySelector('[data-testid="editor"]'));
 await mount('/admin',{...account,role:'reader'});await wait(()=>document.querySelector('#feed')?.textContent.includes('관리자만'),'Admin route remains role protected');assert.equal(location.pathname,'/admin');
 await mount('/Owner',null);await wait(()=>document.querySelector('.writer-about h2'),'Direct public profile survives route changes');assert.equal(location.pathname,'/Owner');assert.equal(document.querySelector('.writer-about h2').textContent,longName,'Profile keeps the complete display name');
 click('.rail a[data-view="home"]');history.back();await wait(()=>location.pathname==='/Owner'&&document.querySelector('.writer-about h2'),'Back restores profile');
 let finishLogin;authGate=new Promise(resolve=>finishLogin=resolve);await mount('/home?auth=success');sessionStorage.setItem('ark-auth-return-page',JSON.stringify({path:'/bookmark',at:Date.now()}));finishLogin();authGate=null;await wait(()=>document.querySelector('#page-title')?.textContent==='저장한 포스트','OAuth returns to original menu');assert.equal(location.pathname,'/bookmark');assert.equal(location.search,'');
 await mount('/home#post-published',null);await wait(()=>document.querySelector('#reader-title'),'Legacy post hash opens');assert.equal(location.pathname,'/Owner/posts/published');assert.equal(location.hash,'');
 console.log('Navigation passed: native menu URLs, direct/reload search and filters, back/forward reader state, bookmarks and auth guards, delayed auth/direct draft loading, dirty cancellation, saved-post return path, long names and legacy post links.');
}finally{root?.unmount();await vite.close();dom.window.close();}
