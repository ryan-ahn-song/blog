import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/search?q=OrdinaryMember',pretendToBeVisual:true});
for(const key of ['window','document','location','history','navigator','localStorage','sessionStorage','HTMLElement','Event','MouseEvent','PopStateEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.HTMLElement.prototype.scrollTo=function(){};window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'));};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.IntersectionObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
const target={id:'ordinary',username:'OrdinaryMember',name:'일반 회원',bio:'포스트를 쓰지 않아도 만날 수 있어요.',post_count:0,notice_count:0,total_views:0};
const member={id:'follower',username:'Follower',name:'구독하는 회원',role:'reader',version:1};
const author={...target,id:'author',username:'ActiveWriter',name:'공개 작성자'},admin={...target,id:'admin',username:'ActiveAdmin',name:'공개 관리자'};
let actor=member,subscribed=false,root,calls=[];
globalThis.fetch=async(path,options={})=>{
 const url=new URL(path,location.origin);let data;
 if(url.pathname==='/api/auth/me')data={user:actor};
 else if(url.pathname==='/api/auth/providers')data={google:true,github:true};
 else if(url.pathname==='/api/topics')data={topics:[]};
 else if(url.pathname==='/api/posts'||url.pathname==='/api/trending'||url.pathname==='/api/reading-history')data={posts:[],total:0,page:0};
 else if(url.pathname==='/api/writers'){const visible=url.searchParams.get('q')?[author,admin].filter(w=>w.username.toLowerCase().includes(url.searchParams.get('q').toLowerCase())):[author,admin];data={writers:visible,total:visible.length,page:0};}
 else if(url.pathname==='/api/writers/by-name/OrdinaryMember'||url.pathname==='/api/writers/ordinary')data={writer:{...target,subscribed:actor?subscribed:false}};
 else if(url.pathname==='/api/writers/ordinary/taxonomy')data={writer_id:target.id,categories:[],tags:[]};
 else if(url.pathname==='/api/subscriptions')data={writers:subscribed?[{...target,latest_post:null}]:[],total:subscribed?1:0};
 else if(url.pathname==='/api/writers/ordinary/subscription'&&options.method==='PUT'){const body=JSON.parse(options.body);calls.push(body);subscribed=body.active;data={subscribed};}
 else throw Error('Unexpected API '+url.pathname);
 return Response.json(data);
};
const wait=async(predicate,message)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>5000)throw Error(message+' '+document.body.textContent.slice(0,900));await new Promise(resolve=>setTimeout(resolve,20));}};
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {default:App}=await vite.ssrLoadModule('/src/App.jsx'),{clearApiCache}=await vite.ssrLoadModule('/src/api.js');
 async function mount(path){root?.unmount();await new Promise(resolve=>setTimeout(resolve,20));clearApiCache();history.replaceState(null,'',path);root=createRoot(document.getElementById('root'));root.render(createElement(App));}
 await mount('/search?q=OrdinaryMember');await wait(()=>document.querySelector('.explore-empty')?.textContent.includes('일치하는 프로필이 없어요.'),'Reader absent from search');assert(!document.querySelector('.creator-card'));
 assert.equal(document.querySelector('.explore-heading h2').textContent,'검색한 프로필');assert(document.querySelector('#search').placeholder.includes('유저네임'));assert.equal(document.querySelector('.rail a[data-view="writers"]').getAttribute('aria-label'),'멤버');assert(!document.querySelector('a[data-view="write"]'),'Reader cannot start writing');
 await mount('/search?q=ActiveWriter');await wait(()=>document.querySelector('.creator-card'),'Author search result');assert.equal(document.querySelector('.creator-card strong').textContent,author.name);
 await mount('/people');await wait(()=>document.querySelectorAll('.writer-card').length===2,'Author and admin directory');assert.deepEqual([...document.querySelectorAll('.writer-card strong')].map(node=>node.textContent),[author.name,admin.name]);assert(!document.querySelector('.writer-card[data-author="ordinary"]'));
 await mount('/OrdinaryMember');await wait(()=>document.querySelector('.writer-about h2'),'Direct reader profile still opens');assert.equal(document.querySelector('.writer-about h2').textContent,target.name);await wait(()=>document.querySelector('.writer-posts')?.textContent.includes('아직 업로드된 포스트가 없어요.'),'Reader profile has an empty published post list');assert(!document.querySelector('.taxonomy-error'));
 const subscribe=()=>[...document.querySelectorAll('.writer-profile-actions button')].find(button=>button.textContent==='구독하기'||button.textContent==='구독 중');
 subscribe().click();await wait(()=>subscribe()?.getAttribute('aria-pressed')==='true','Reader can subscribe to reader');assert.deepEqual(calls,[{active:true}]);
 await mount('/OrdinaryMember');await wait(()=>subscribe()?.getAttribute('aria-pressed')==='true','Direct reload restores reader subscription');subscribe().click();await wait(()=>subscribe()?.getAttribute('aria-pressed')==='false','Reader can unsubscribe');assert.deepEqual(calls.at(-1),{active:false});
 actor=null;await mount('/OrdinaryMember');await wait(()=>document.querySelector('.writer-about h2'),'Guest can open reader profile');const before=calls.length;subscribe().click();await wait(()=>document.querySelector('.auth-dialog[open]'),'Guests are asked to log in before subscribing');assert.equal(calls.length,before);
 console.log('Profile UI passed: reader excluded from search/directory, author/admin discovery, member navigation, public zero-post profile and direct reload, reader-to-reader subscribe/unsubscribe persistence, guest login gate and unchanged author navigation guard.');
}finally{root?.unmount();await vite.close();dom.window.close();}
