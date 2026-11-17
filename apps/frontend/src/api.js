// Memory only: private responses never enter a shared browser/CDN cache.
const entries=new Map(),inflight=new Map();let scope='anonymous',epoch=0;
export function clearApiCache(){entries.clear();inflight.clear();epoch++;}
export function setApiScope(next){if(scope!==next){scope=next;clearApiCache();}}
const cacheable=path=>/^\/api\/(posts(?:\?|\/[^/?]+$)|writers(?:\?|\/[^/?]+$|$)|topics$|trending$|subscriptions$|author\/dashboard\?)/.test(path);
export async function api(path,options={}){
  // Public catalog data remains valid while the first auth request establishes scope.
  const publicData=path==='/api/topics'||path==='/api/trending',requestedScope=scope;
  const method=(options.method??'GET').toUpperCase(),cached=method==='GET'&&cacheable(path),key=(publicData?'public':scope)+':'+epoch+':'+path;
  if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
  async function request(){
    const {signal,...rest}=options;
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...rest,...(!cached&&signal?{signal}:{})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401){clearApiCache();if(typeof window!=='undefined')window.dispatchEvent(new Event('ark-auth-expired'));}const error=new Error(body.error||'요청을 처리하지 못했습니다.');error.status=response.status;throw error;}
    if(method!=='GET'&&path!=='/api/reading-history'&&!/^\/api\/posts\/[^/]+\/view$/.test(path))clearApiCache();return body;
  }
  if(!cached)return request();
  const previous=entries.get(key);if(previous&&Date.now()-previous.at<30000)return previous.value;
  let promise=inflight.get(key);
  if(!promise){const generation=epoch;promise=request().then(value=>{if(generation===epoch){entries.delete(key);entries.set(key,{value,at:Date.now()});while(entries.size>60)entries.delete(entries.keys().next().value);}return value;}).finally(()=>inflight.delete(key));inflight.set(key,promise);}
  const value=await promise;if((!publicData&&scope!==requestedScope)||options.signal?.aborted)throw new DOMException('Aborted','AbortError');return value;
}
export const jsonRequest=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const roleName=role=>({reader:'열람자',author:'작성자',admin:'관리자'}[role]||role);
