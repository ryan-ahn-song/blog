import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/people',pretendToBeVisual:true});
for(const key of ['window','document','location','history','navigator','localStorage','sessionStorage','HTMLElement','Event','MouseEvent','PopStateEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.HTMLElement.prototype.scrollTo=function(){};window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const member={id:'owner',username:'Owner',name:'현재 멤버',role:'author',version:1};
const writer={id:'other',username:'Other',name:'검색 결과',post_count:0,notice_count:0,bio:''};
const post={id:'draft',writer:member,title:'인증 후 초안',body:'비공개 본문',summary:'소개',category:'tech',body_format:'plain',status:'draft',created_at:1794614400,like_count:0,saved:false,liked:false};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
let authGate,peopleGate,postGate,queryGates=new Map(),requests=[],root;
globalThis.fetch=async(path)=>{
 const url=new URL(path,location.origin);requests.push(url.pathname+url.search);
 if(url.pathname==='/api/auth/me'){if(authGate)await authGate.promise;return Response.json({user:member});}
 if(url.pathname==='/api/writers'){const q=url.searchParams.get('q')??'';if(queryGates.has(q))await queryGates.get(q).promise;else if(peopleGate)await peopleGate.promise;return Response.json({writers:[{...writer,name:q||writer.name}],total:1,page:0});}
 if(url.pathname==='/api/topics')return Response.json({topics:[]});
 if(url.pathname==='/api/posts/draft'){if(postGate)await postGate.promise;return Response.json({post});}
 if(url.pathname==='/api/posts')return Response.json({posts:[],total:0,page:0});
 if(url.pathname==='/api/trending'||url.pathname==='/api/reading-history')return Response.json({posts:[]});
 if(url.pathname==='/api/subscriptions')return Response.json({writers:[]});
 throw Error('Unexpected loading API '+url.pathname);
};
const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
const wait=async(predicate,message)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>5000)throw Error(message+' '+document.body.textContent.slice(0,900));await pause();}};
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {default:App}=await vite.ssrLoadModule('/src/App.jsx'),{clearApiCache}=await vite.ssrLoadModule('/src/api.js');
 async function mount(path){root?.unmount();await pause();clearApiCache();requests=[];history.replaceState(null,'',path);root=createRoot(document.getElementById('root'));root.render(createElement(App));}
 authGate=deferred();peopleGate=deferred();await mount('/people');await wait(()=>document.querySelector('.skeleton-members'),'Member skeleton is immediate');
 await wait(()=>requests.includes('/api/writers'),'Public member request starts while auth is pending');assert(document.querySelector('.skeleton-members [aria-hidden="true"]'));assert(!document.querySelector('.skeleton-members a,.skeleton-members button'));assert(!document.body.textContent.includes('아직 등록된 멤버가 없어요.'));
 authGate.resolve();authGate=null;await wait(()=>document.querySelector('.rail-profile')?.getAttribute('aria-label')==='내 프로필','Auth restores without cancelling public data');peopleGate.resolve();peopleGate=null;await wait(()=>document.querySelector('.writer-card'),'Member results replace skeleton');assert(!document.querySelector('.skeleton-members'));assert.equal(document.querySelector('.subscription-updates h2').textContent,'내 구독');
 await mount('/search?q=first');await wait(()=>document.querySelector('.creator-card')?.textContent.includes('first'),'Initial search result');
 queryGates.set('second',deferred());const input=document.querySelector('#search');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'second');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>document.querySelector('.skeleton-creators'),'Changed query uses skeleton');assert(!document.querySelector('.creator-card'),'Old query results are not displayed while pending');assert(!document.querySelector('.explore-empty')?.textContent.includes('일치하는 프로필이 없어요.'));
 queryGates.get('second').resolve();await wait(()=>document.querySelector('.creator-card')?.textContent.includes('second'),'New query results replace skeleton');queryGates.clear();
 authGate=deferred();postGate=deferred();await mount('/Owner/posts/draft');await wait(()=>document.querySelector('.skeleton-reader'),'Direct reader starts with a reader skeleton');assert(document.querySelector('.content-columns').hidden);assert(!document.querySelector('#page-title'),'Direct reader does not flash the Home heading');assert(!requests.includes('/api/posts/draft'),'Private article request waits for account restoration');assert(!document.querySelector('.reader-message'));
 authGate.resolve();authGate=null;await wait(()=>requests.includes('/api/posts/draft'),'Article request resumes after auth');assert(document.querySelector('.skeleton-reader'));postGate.resolve();postGate=null;await wait(()=>document.querySelector('#reader-title'),'Article replaces skeleton');assert.equal(document.querySelector('#reader-title').textContent,post.title);assert(!document.querySelector('.skeleton-reader'));
 const {default:Skeleton}=await vite.ssrLoadModule('/src/LoadingSkeleton.jsx'),{renderToString}=await import('react-dom/server');
 for(const variant of ['feed','members','creators','results','profile','reader','editor','dashboard','chart','rows','comments','account','consent','text']){const markup=renderToString(createElement(Skeleton,{variant,label:'내용을 불러오고 있어요.'}));assert(markup.includes('aria-hidden="true"'));assert(markup.includes('role="status"'));assert(!/<(?:button|input|a)\b/.test(markup),'Skeletons have no interactive controls');}
 const css=await readFile(new URL('../apps/frontend/src/loading.css',import.meta.url),'utf8');assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('data-reduce-motion=true'));assert(!css.includes('linear-gradient'),'Only opacity is animated');
 const {bootHtml,bootKind}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../apps/frontend/boot.ts',import.meta.url)).replaceAll('\\','/'));
 const template='<!doctype html><html><head></head><body><div id="root"></div></body></html>';
 for(const [page,kind]of [[{type:'home'},'feed'],[{type:'people'},'members'],[{type:'writer'},'profile'],[{type:'post'},'reader'],[{type:'app',path:'/search'},'search'],[{type:'app',path:'/write'},'editor']]){assert.equal(bootKind(page),kind);const html=bootHtml(template,kind,'<main id="fallback-post">원본 본문</main>');assert(html.includes('data-boot-view="'+kind+'"'));assert(html.includes('<noscript>'));assert(html.includes('id="fallback-post"'));assert(html.includes('prefers-reduced-motion'));}
 const fallbackDom=new JSDOM(bootHtml(template,'reader','<main id="fallback-post">원본 본문</main>'),{url:'https://21st-ark.dev/Owner/posts/draft',runScripts:'outside-only'});let recover,cleared=0;fallbackDom.window.setTimeout=fn=>{recover=fn;return 1;};fallbackDom.window.clearTimeout=()=>cleared++;
 const recovery=await readFile(new URL('../apps/frontend/public/assets/boot.js',import.meta.url),'utf8');fallbackDom.window.eval(recovery);recover();assert(fallbackDom.window.document.querySelector('.boot-recovery[role="alert"]'),'Failed JS load gives a retry instead of indefinite skeleton');assert(cleared);fallbackDom.window.document.querySelector('.boot-recovery button:last-child').click();assert.equal(fallbackDom.window.document.querySelector('.seo-fallback').style.display,'block');assert(fallbackDom.window.document.getElementById('fallback-post'));fallbackDom.window.close();
 console.log('Loading passed: immediate route-specific placeholders, parallel public catalog/auth, account-scope-safe public requests, keyed search without stale/false-empty frames, direct reader auth gating, accessible inert shapes, reduced motion, first-paint skeleton and retained SEO/no-JS/retry recovery.');
}finally{authGate?.resolve();peopleGate?.resolve();postGate?.resolve();for(const gate of queryGates.values())gate.resolve();root?.unmount();await vite.close();dom.window.close();}
