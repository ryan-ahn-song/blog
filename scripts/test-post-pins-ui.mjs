import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
try{
 const {default:Pin}=await vite.ssrLoadModule('/src/PostPinButton.jsx');
 const post={id:'post',title:'소개',status:'published',kind:'post',pinned:false};
 for(const role of [null,'reader','author'])assert.equal(renderToStaticMarkup(createElement(Pin,{post,user:role?{id:role,role}:null})), '');
 const render=(p=post)=>renderToStaticMarkup(createElement(Pin,{post:p,user:{id:'admin',role:'admin'}}));
 assert(render().includes('소개 고정'));assert(render({...post,pinned:true}).includes('소개 고정 해제'));assert(render({...post,pinned:true}).includes('aria-pressed="true"'));
 for(const p of [{...post,status:'draft'},{...post,kind:'notice'}])assert.equal(render(p),'');
 const {TrendingPostCards}=await vite.ssrLoadModule('/src/CommunitySidebar.jsx');
 const markup=renderToStaticMarkup(createElement(TrendingPostCards,{posts:[{...post,pinned:true},...['a','b','c'].map(id=>({...post,id,title:id}))]}));
 assert.equal((markup.match(/class="trending-post-card"/g)||[]).length,3);assert(markup.includes('pinned-rank">고정'));assert(!markup.includes('aria-label="c 읽기"'));
 const recent=renderToStaticMarkup(createElement(TrendingPostCards,{posts:[{...post,pinned:true}],ranked:false}));assert(!recent.includes('pinned-rank'),'Recent history keeps its own chronology and presentation');
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/home'});
 for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('root'));let current={...post},calls=[],finish;
 globalThis.fetch=async(path,options)=>{calls.push({path,options});return new Promise(resolve=>finish=resolve);};
 function draw(){root.render(createElement(Pin,{post:current,user:{id:'admin',role:'admin'},onChanged:change=>{current={...current,...change};draw();}}));}
 const wait=async(check)=>{const start=Date.now();while(!check()){if(Date.now()-start>3000)throw Error('Pin UI did not settle');await new Promise(r=>setTimeout(r,10));}};
 try{
  draw();await wait(()=>document.querySelector('button'));document.querySelector('button').click();await wait(()=>calls.length===1);
  assert.equal(calls[0].path,'/api/posts/post/pin');assert.equal(calls[0].options.method,'PUT');assert.deepEqual(JSON.parse(calls[0].options.body),{active:true});await wait(()=>document.querySelector('button').disabled);
  finish(Response.json({post:{id:'post',pinned:true}}));await wait(()=>document.querySelector('button')?.getAttribute('aria-pressed')==='true');
  document.querySelector('button').click();await wait(()=>calls.length===2);assert.deepEqual(JSON.parse(calls[1].options.body),{active:false});
  finish(Response.json({error:'권한이 변경되었습니다.'},{status:403}));await wait(()=>document.querySelector('[role="alert"]'));assert(document.querySelector('[role="alert"]').textContent.includes('권한이 변경'));assert.equal(current.pinned,true,'Failed mutations preserve pin state');
 }finally{root.unmount();dom.window.close();}
 console.log('Post pin UI passed: admin-only public-post controls, active state and unpin labels, three-slot trending and pinned badge, unchanged recent history.');
}finally{await vite.close();}
