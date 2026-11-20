import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/home',pretendToBeVisual:true});
for(const key of ['window','document','location','history','navigator','localStorage','sessionStorage','HTMLElement','Event','MouseEvent','PopStateEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.HTMLElement.prototype.scrollTo=function(){};window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const intersections=[],sizes=[];
globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;intersections.push(this);}observe(element){this.element=element;}disconnect(){this.closed=true;}};
globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;sizes.push(this);}observe(element){this.element=element;}disconnect(){this.closed=true;}};
const writer={id:'owner',username:'Owner',name:'필자',post_count:29};
const posts=Array.from({length:29},(_,i)=>({id:'post-'+(i+1),title:'포스트 '+(i+1),summary:'소개',body:'본문',writer,category:'tech',body_format:'plain',status:'published',published_at:1794614400,like_count:0,saved:false,liked:false}));
let count=6,root,feedQueries=[];
globalThis.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url,location.origin);let data;
 if(url.pathname==='/api/auth/me')data={user:null};
 else if(url.pathname==='/api/topics')data={topics:[{id:'tech',name:'개발 · 기술'}]};
 else if(url.pathname==='/api/posts'){feedQueries.push(url);const page=Number(url.searchParams.get('page')??0);data={posts:posts.slice(page*12,Math.min(count,(page+1)*12)),total:count,page};}
 else if(url.pathname==='/api/writers')data={writers:[writer],total:1,page:0};
 else if(url.pathname==='/api/trending'||url.pathname==='/api/reading-history')data={posts:[]};
 else if(url.pathname==='/api/posts/post-1')data={post:posts[0]};
 else if(url.pathname==='/api/posts/post-1/comments')data={comments:[],total:0,page:0};
 else if(url.pathname==='/api/posts/post-1/view')data={counted:true};
 else throw Error('Unexpected API '+url.pathname);
 return Response.json(data);
};
const wait=async(predicate,message)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>5000)throw Error(message+' '+document.body.textContent.slice(0,800));await new Promise(resolve=>setTimeout(resolve,20));}};
const click=selector=>{const target=document.querySelector(selector);assert(target,selector);target.click();};
const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
try{
 const {default:App}=await vite.ssrLoadModule('/src/App.jsx'),{clearApiCache}=await vite.ssrLoadModule('/src/api.js');
 async function mount(path='/home'){root?.unmount();await pause();clearApiCache();history.replaceState(null,'',path);root=createRoot(document.getElementById('root'));root.render(createElement(App));await wait(()=>path.startsWith('/search')?(count?document.querySelector('.explore-result'):document.body.textContent.includes('일치하는 포스트가 없어요.')):document.querySelector('#feed article.post')||document.querySelector('#feed .empty'),'Feed loads');}
 for(const path of ['/home','/search'])for(const size of [0,1,2,6,7]){count=size;await mount(path);assert.equal(document.querySelectorAll('.feed-ad').length,size?1:0,'One ad for non-empty short feeds, none for empty feeds: '+path+' '+size);if(size)assert.equal(document.querySelector('.feed-ad').dataset.adAfter,String(path==='/home'?1:size));if(size&&path==='/home'){const entries=[...document.querySelector('#feed').children].filter(el=>el.matches('.post'));assert(entries[0].matches('article.post'));assert(entries[1].matches('.feed-ad'),'Home always fixes the ad directly after the first organic post');}assert(!document.querySelector('#ark-adfit-sdk'),'Offscreen minimum ad never requests SDK');}
 assert(feedQueries.some(url=>url.searchParams.get('pin_first')==='1'),'Home requests pin-first ordering');assert(feedQueries.some(url=>!url.searchParams.has('pin_first')),'Search retains latest ordering');
 count=29;await mount();await wait(()=>document.querySelectorAll('#feed article.post').length===12,'First page loads');assert.deepEqual([...document.querySelectorAll('.feed-ad')].map(el=>el.dataset.adAfter),['1','8']);
 click('.load-more');await wait(()=>document.querySelectorAll('#feed article.post').length===24,'Append page two');click('.load-more');await wait(()=>document.querySelectorAll('#feed article.post').length===29,'Append page three');
 const cards=[...document.querySelector('#feed').children].filter(el=>el.matches('.post'));
 const adPositions=cards.flatMap((el,i)=>el.matches('.feed-ad')?[i]:[]);assert.deepEqual(adPositions,[1,9,17,25,33],'Cadence remains correct across API pages');assert.equal(document.querySelectorAll('#feed article.post').length,29,'Ads never replace organic posts');assert(!document.querySelector('#ark-adfit-sdk'),'Offscreen slots do not load SDK');
 await wait(()=>intersections.filter(item=>!item.closed).length===5,'All ad effects mounted');
 for(const size of sizes.filter(item=>!item.closed&&item.element.matches('.feed-ad-stage')))size.callback([{contentRect:{width:600}}]);
 const active=intersections.filter(item=>!item.closed);assert.equal(active.length,5);active[0].callback([{isIntersecting:true}]);await wait(()=>document.querySelector('#ark-adfit-sdk'),'Visible ad loads SDK');
 const script=document.querySelector('#ark-adfit-sdk');assert.equal(script.src,'https://t1.kakaocdn.net/kas/static/ba.min.js');assert(script.async);
 const renders=[],destroyed=[],occupied=new Set(),events=[];
 window.adfit={render(element){const unit=element.dataset.adUnit;assert(!occupied.has(unit),'No simultaneous duplicate unit');occupied.add(unit);renders.push(element);events.push('render:'+unit);element.style.display='block';const creative=document.createElement('span');creative.textContent='검증용 광고';element.append(creative);},destroy(element){occupied.delete(element.dataset.adUnit);destroyed.push(element);events.push('destroy:'+element.dataset.adUnit);}};
 script.dispatchEvent(new Event('load'));await pause();assert.equal(renders.length,0,'Script load waits for asynchronous SDK startup');const commands=window.kakaoAdFit.cmd;window.kakaoAdFit={cmd:{push:fn=>fn()}};commands.forEach(fn=>fn());await wait(()=>renders.length===1,'SDK renders first slot');for(const observer of active)observer.callback([{isIntersecting:true}]);await wait(()=>renders.length===3,'Only three distinct units can be active');assert.equal(occupied.size,3);assert.equal(document.querySelectorAll('#ark-adfit-sdk').length,1);
 active[0].callback([{isIntersecting:false}]);await wait(()=>renders.length===4,'Released unit serves later slot');assert.equal(destroyed.length,1);assert.equal(occupied.size,3);assert(events.indexOf('destroy:'+renders[0].dataset.adUnit)<events.lastIndexOf('render:'+renders[0].dataset.adUnit));
 active[3].callback([{isIntersecting:true}]);await pause();assert.equal(renders.length,4,'Observer updates do not refresh an existing ad');
 const adControl=document.createElement('button');adControl.dataset.view='search';renders.at(-1).append(adControl);adControl.click();await pause();assert.equal(location.pathname,'/home','Ad controls cannot invoke blog navigation/reaction delegation');adControl.remove();
 const fail=renders.at(-1).dataset.adOnfail;window[fail]();await wait(()=>document.querySelectorAll('.feed-ad').length===4,'No fill hides ad without disturbing posts');assert.equal(document.querySelectorAll('#feed article.post').length,29);assert.equal(window[fail],undefined,'Callbacks cleaned up');
 Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));await wait(()=>occupied.size===0,'Background tab releases ads');
 window.doNotTrack='1';Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));await pause();assert.equal(occupied.size,0,'A changed DNT preference blocks new requests in an existing feed');window.doNotTrack=undefined;
 click('.rail a[data-view="search"]');await wait(()=>document.querySelectorAll('.explore-result').length===12,'Search navigation');assert.equal(document.querySelectorAll('.feed-ad-grid').length,1,'Search includes an ad card');assert.equal(occupied.size,0,'Old Home ads are destroyed on navigation');click('.load-more');await wait(()=>document.querySelectorAll('.explore-result').length===24,'Append search page two');click('.load-more');await wait(()=>document.querySelectorAll('.explore-result').length===29,'Append search page three');const searchCards=[...document.querySelector('.explore-results').children];assert.deepEqual(searchCards.flatMap((el,i)=>el.matches('.feed-ad')?[i]:[]),[7,15,23,31],'Search cadence stays correct across pages');assert.equal(document.querySelector('.explore-heading h2').textContent,'멤버 둘러보기','Ads do not replace the writer section');
 click('.rail a[data-view="home"]');await wait(()=>document.querySelectorAll('.feed-ad').length>0,'Home ads return');click('.post-title[data-post="post-1"]');await wait(()=>document.querySelector('#reader-title'),'Reader opens');assert.equal(document.querySelectorAll('.feed-ad').length,0,'No ads behind reader');assert.equal(occupied.size,0);
 window.doNotTrack='1';await mount();assert.equal(document.querySelectorAll('.feed-ad').length,0,'DNT suppresses ads');window.doNotTrack=undefined;
 await mount();await wait(()=>sizes.some(item=>!item.closed&&item.element.matches('.feed-ad-stage')),'Resize effects mounted');const narrow=sizes.filter(item=>!item.closed&&item.element.matches('.feed-ad-stage'));narrow[0].callback([{contentRect:{width:280}}]);await wait(()=>document.querySelector('.feed-ad')?.dataset.fit==='false','Too narrow slots collapse');assert.equal(document.querySelector('.feed-ad').getAttribute('aria-hidden'),'true');
 root.unmount();root=null;await pause();assert.equal(occupied.size,0,'Unmount releases every placement');
 const {default:worker}=await vite.ssrLoadModule('/@fs/'+fileURLToPath(new URL('../apps/frontend/worker.ts',import.meta.url)).replaceAll('\\','/'));
 const env={ASSETS:{fetch:async()=>new Response('<html><head></head><body></body></html>',{headers:{'Content-Type':'text/html'}})},API:{fetch:async()=>Response.json({})}};
 for(const path of ['/home','/search','/write','/connect']){const response=await worker.fetch(new Request('https://21st-ark.dev'+path),env),csp=response.headers.get('Content-Security-Policy');assert.equal(csp.includes('https://t1.kakaocdn.net'),path!=='/connect');assert(csp.includes("script-src-attr 'none'"));assert(!csp.includes("'unsafe-eval'"));assert(csp.includes("frame-ancestors 'none'"));assert.equal(response.headers.get('Cache-Control'),'private, no-store');}
 console.log('AdFit passed: fixed second Home item after the first organic post, subsequent 7-post spacing across pages, unchanged search minimum-one/cadence, no ads in empty feeds, search ad cards and reader exclusion, single lazy SDK, distinct concurrent units with reuse after destroy, no refresh, no-fill cleanup, DNT, hidden tab and unmount cleanup, narrow slots, strict OAuth CSP. No real ads requested or clicked.');
}finally{root?.unmount();await vite.close();dom.window.close();}
