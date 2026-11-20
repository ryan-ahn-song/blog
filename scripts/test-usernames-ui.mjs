import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://21st-ark.dev/home',pretendToBeVisual:true});
for(const key of ['window','document','location','navigator','HTMLElement','Event','MouseEvent','DOMException'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const legal={version:'test',review_notice:'',contact:'test@example.invalid',documents:{terms:{title:'이용약관',sections:[]},privacy:{title:'개인정보처리방침',sections:[]}}};
let taken=false,completed,root;const requests=[];
globalThis.fetch=async(path,options={})=>{const url=new URL(path,location.origin);requests.push({path:url.pathname,username:url.searchParams.get('username'),body:options.body&&JSON.parse(options.body)});if(url.pathname==='/api/auth/legal')return Response.json(legal);if(url.pathname==='/api/auth/username-availability')return Response.json({available:!taken});if(url.pathname==='/api/auth/signup')return Response.json({user:{id:'new',username:JSON.parse(options.body).username,role:'reader'}},{status:201});throw Error('Unexpected API '+url.pathname);};
const wait=async(predicate,label)=>{const start=Date.now();while(!predicate()){if(Date.now()-start>4000)throw Error(label+' '+document.body.textContent);await new Promise(resolve=>setTimeout(resolve,15));}};
const {createElement}=await import('react'),{createRoot}=await import('react-dom/client');
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {default:Signup}=await vite.ssrLoadModule('/src/SignupDialog.jsx');
 const {clearApiCache}=await vite.ssrLoadModule('/src/api.js');
 async function mount(){root?.unmount();await new Promise(resolve=>setTimeout(resolve,15));clearApiCache();root=createRoot(document.getElementById('root'));root.render(createElement(Signup,{signup:{provider:'google',name:'새 회원'},onComplete:user=>completed=user}));await wait(()=>document.querySelectorAll('.consent-check input').length===2,'Signup consent loads');}
 async function enter(value){const input=document.querySelector('input[autocomplete="username"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,20));}
 await mount();await enter('21st-ARK');assert(document.querySelector('.username-help').textContent.includes('/21st-ARK'),'Numeric name has a real profile-address preview');document.querySelector('.username-input-row button').click();await wait(()=>document.querySelector('.username-result.available'),'Numeric-leading availability request succeeds');assert.equal(requests.find(r=>r.path.endsWith('username-availability')).username,'21st-ARK');for(const checkbox of document.querySelectorAll('.consent-check input'))checkbox.click();await wait(()=>!document.querySelector('.signup-submit').disabled,'Signup unlocks after availability and consent');document.querySelector('.signup-submit').click();await wait(()=>completed,'Signup completes');assert.equal(completed.username,'21st-ARK');assert.equal(requests.find(r=>r.path.endsWith('/signup')).body.username,'21st-ARK');
 taken=true;await mount();await enter('21ST-ark');document.querySelector('.username-input-row button').click();await wait(()=>document.querySelector('.username-result')?.textContent.includes('이미 사용 중'),'Duplicate names still fail');assert(document.querySelector('.signup-submit').disabled);
 for(const value of ['-first','123 name','404','api']){await enter(value);const before=requests.length;document.querySelector('.username-input-row button').click();await wait(()=>document.querySelector('.username-result')?.textContent.includes('문자 또는 숫자'),'Invalid name explains allowed first characters');assert.equal(requests.length,before,'Invalid/reserved names never pass client validation');assert(document.querySelector('.signup-submit').disabled);}
 console.log('Username UI passed: 21st-ARK preview, server availability, consent-gated signup, duplicate rejection, reserved/invalid names and matching first-character guidance. No real accounts created.');
}finally{root?.unmount();await vite.close();dom.window.close();}
