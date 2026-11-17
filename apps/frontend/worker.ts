import { CANONICAL_ORIGIN } from '../../shared/site';
import {loadPublicPage,applyPublicHtml,sitemapResponse} from './seo';
interface Env { ASSETS: Fetcher; API: Fetcher }
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url),api=url.pathname.startsWith('/api/');
    // Keep legacy callbacks on their original host: their state cookies are host-bound.
    const callback=/^\/api\/auth\/callback\/(google|github)$/.test(url.pathname);
    if(url.hostname==='21stark.dev'&&!callback){
      const target=new URL(CANONICAL_ORIGIN);target.pathname=url.pathname;target.search=url.search;
      if(!['GET','HEAD'].includes(request.method))return Response.json({error:'메인 도메인에서 다시 시도해 주세요.',origin:CANONICAL_ORIGIN},{status:421,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      return new Response(null,{status:308,headers:{Location:target.href,'Cache-Control':'public, max-age=300','Referrer-Policy':'no-referrer'}});
    }
    if(url.hostname==='21st-ark.dev'&&url.protocol!=='https:'){
      url.protocol='https:';return new Response(null,{status:308,headers:{Location:url.href,'Cache-Control':'no-store'}});
    }
    let response:Response,canonical:string|undefined;
    if(url.pathname==='/'&&['GET','HEAD'].includes(request.method))return new Response(null,{status:301,headers:{Location:CANONICAL_ORIGIN+'/home'+url.search,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    if(!api&&['GET','HEAD'].includes(request.method)&&!url.pathname.startsWith('/assets/')){
      const map=await sitemapResponse(url,env);
      if(map)response=map;
      else{
        const {status,page}=await loadPublicPage(url,env);
        if(page&&url.pathname!==page.path)return new Response(null,{status:301,headers:{Location:new URL(page.path+(page.type==='app'||page.type==='home'||page.type==='people'?url.search:''),CANONICAL_ORIGIN).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
        const asset=await env.ASSETS.fetch(new Request(new URL('/',url),{headers:{Accept:'text/html'}}));
        const headers=new Headers(asset.headers);headers.delete('ETag');headers.delete('Content-Length');headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','private, no-store');
        if(page)canonical=new URL(page.path,CANONICAL_ORIGIN).href;if(!page||page.indexable===false)headers.set('X-Robots-Tag','noindex, nofollow');
        response=new Response(applyPublicHtml(await asset.text(),page,status),{status,headers});
      }
    }else response=await (api?env.API:env.ASSETS).fetch(request);
    const result=new Response(request.method==='HEAD'?null:response.body,response);
    result.headers.set('X-Content-Type-Options','nosniff');
    result.headers.set('X-Frame-Options','DENY');
    result.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    result.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    result.headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
    result.headers.set('Cross-Origin-Resource-Policy',url.pathname.startsWith('/api/social/')||url.pathname==='/assets/social-default.png'?'cross-origin':'same-origin');
    if(url.protocol==='https:')result.headers.set('Strict-Transport-Security','max-age=31536000');
    if(!api&&result.headers.get('Content-Type')?.includes('text/html')){
      result.headers.set('Cache-Control','private, no-store');
      if(canonical)result.headers.set('Link','<'+canonical+'>; rel="canonical"');
      result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
    }
    return result;
  },
} satisfies ExportedHandler<Env>;
