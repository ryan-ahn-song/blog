import {CANONICAL_ORIGIN} from '../../shared/site';
import {pageRoute} from '../../shared/paths';
type PublicPage={type:string;path:string;title?:string;summary?:string;name?:string;username?:string;bio?:string;body?:string;body_doc?:unknown;image?:string;writer?:{name:string;username:string;id:string};published_at?:number;updated_at?:number;posts?:any[];writers?:any[]};
type Env={API:Fetcher};
export const htmlEscape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const absolute=(path:string)=>new URL(path,CANONICAL_ORIGIN).href;
function text(value:any):string{
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(text).join(' ');
 if(!value||typeof value!=='object')return '';
 if(typeof value.text==='string')return value.text;
 return [text(value.content??value.rows??value.cells),text(value.children)].filter(Boolean).join(' ');
}
export function description(page:PublicPage){return (page.summary||page.bio||text(page.body_doc)||page.body||'21st ARK에서 포스트를 읽고 필자를 만나보세요.').replace(/[#*`>\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,240);}
function documentHtml(page:PublicPage){
 if(Array.isArray(page.body_doc))return page.body_doc.map((block:any)=>{
  const content=htmlEscape(text(block.content)),children=Array.isArray(block.children)?documentHtml({...page,body_doc:block.children}):'';
  if(block.type==='heading'){const level=[1,2,3].includes(block.props?.level)?block.props.level:2;return `<h${level+1}>${content}</h${level+1}>${children}`;}
  if(block.type==='codeBlock')return `<pre><code>${content}</code></pre>${children}`;
  if(block.type==='quote')return `<blockquote>${content}</blockquote>${children}`;
  if(block.type==='divider')return '<hr/>';
  if(block.type==='image')return `<p>${htmlEscape(block.props?.caption??'')}</p>${children}`;
  return `<p>${content}</p>${children}`;
 }).join('');
 return `<div class="seo-text">${htmlEscape(page.body??'')}</div>`;
}
function postLinks(posts:any[]=[]){return posts.map(post=>`<article><h2><a href="${htmlEscape(post.path)}">${htmlEscape(post.title)}</a></h2><p>${htmlEscape(post.summary)}</p>${post.writer?`<a href="/${encodeURIComponent(post.writer.username)}">${htmlEscape(post.writer.name)}</a>`:''}</article>`).join('');}
export function pageHtml(page:PublicPage){
 if(page.type==='post')return `<main class="seo-page"><a href="/">21st ARK</a><article><header><h1>${htmlEscape(page.title)}</h1><p>${htmlEscape(page.summary)}</p><a href="/${encodeURIComponent(page.writer!.username)}">${htmlEscape(page.writer!.name)}</a></header>${page.image?`<img src="${htmlEscape(page.image)}" alt="${htmlEscape(page.title)}"/>`:''}${documentHtml(page)}</article></main>`;
 if(page.type==='writer')return `<main class="seo-page"><a href="/">21st ARK</a><h1>${htmlEscape(page.name)}</h1><p>@${htmlEscape(page.username)}</p><p>${htmlEscape(page.bio)}</p><h2>포스트와 공지</h2>${postLinks(page.posts)}</main>`;
 return `<main class="seo-page"><h1>21st ARK</h1><p>개발과 기술, 일상과 에세이를 읽고 나누는 공간</p><h2>최신 포스트</h2>${postLinks(page.posts)}<h2>필자</h2>${(page.writers??[]).map(writer=>`<p><a href="${htmlEscape(writer.path)}">${htmlEscape(writer.name)}</a> ${htmlEscape(writer.bio)}</p>`).join('')}</main>`;
}
export function metadata(page:PublicPage){
 const title=page.type==='post'?page.title:page.type==='writer'?page.name:'홈',desc=description(page),url=absolute(page.path),image=absolute(page.image??'/assets/social-default.png'),type=page.type==='post'?'article':page.type==='writer'?'profile':'website';
 const tags=[`<title>${htmlEscape(title)} | 21st ARK</title>`,`<link rel="canonical" href="${htmlEscape(url)}"/>`,`<meta name="description" content="${htmlEscape(desc)}"/>`,`<meta name="robots" content="index,follow,max-image-preview:large"/>`,...Object.entries({'og:title':title+' | 21st ARK','og:description':desc,'og:type':type,'og:url':url,'og:image':image,'og:image:secure_url':image,'og:image:alt':page.type==='post'?page.title:page.name||'21st ARK','og:site_name':'21st ARK','og:locale':'ko_KR'}).map(([name,value])=>`<meta property="${name}" content="${htmlEscape(value)}"/>`),...Object.entries({'twitter:card':'summary_large_image','twitter:title':title+' | 21st ARK','twitter:description':desc,'twitter:image':image}).map(([name,value])=>`<meta name="${name}" content="${htmlEscape(value)}"/>`)];
 const schema=page.type==='post'?{'@context':'https://schema.org','@type':'BlogPosting',headline:page.title,description:desc,url,mainEntityOfPage:url,image,author:{'@type':'Person',name:page.writer!.name,url:absolute('/'+encodeURIComponent(page.writer!.username))},datePublished:new Date(page.published_at!*1000).toISOString(),dateModified:new Date(page.updated_at!*1000).toISOString()}:page.type==='writer'?{'@context':'https://schema.org','@type':'ProfilePage',url,mainEntity:{'@type':'Person',name:page.name,identifier:page.username,description:desc,url}}:{'@context':'https://schema.org','@type':'WebSite',name:'21st ARK',url:CANONICAL_ORIGIN};
 tags.push('<script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>');
 return tags.join('');
}
export async function loadPublicPage(url:URL,env:Env){
 const route=pageRoute(url.pathname);
 if(route.type==='missing')return {status:404,page:null};
 const params=new URLSearchParams();if(route.type==='post')params.set('post_id',route.id!);else if(route.type==='writer')params.set('username',route.username!);
 try{const response=await env.API.fetch(new Request(CANONICAL_ORIGIN+'/api/seo/page?'+params,{headers:{Accept:'application/json'}}));if(!response.ok)return {status:response.status===404?404:503,page:null};return {status:200,page:await response.json() as PublicPage};}catch{return {status:503,page:null};}
}
export function applyPublicHtml(source:string,page:PublicPage|null,status:number){
 const clean=source.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'').replace(/<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi,'').replace(/<meta\b(?=[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["']))[^>]*>/gi,'');
 const head=page?metadata(page):'<title>'+(status===404?'페이지를 찾을 수 없습니다.':'잠시 후 다시 시도해 주세요.')+' | 21st ARK</title><meta name="robots" content="noindex,nofollow"/>';
 const body=page?pageHtml(page):'<main class="seo-page"><h1>'+(status===404?'페이지를 찾을 수 없습니다.':'잠시 후 다시 시도해 주세요.')+'</h1><a href="/">홈으로</a></main>';
 return clean.replace('</head>',head+'<style>.seo-page{max-width:850px;margin:60px auto;padding:24px;color:#eee;background:#111;font-family:sans-serif;line-height:1.8}.seo-page a{color:inherit}.seo-page img{max-width:100%;height:auto}.seo-text{white-space:pre-wrap}.seo-page pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head>').replace(/<div id="root"><\/div>/,'<div id="root">'+body+'</div>');
}
export async function sitemapResponse(url:URL,env:Env):Promise<Response|null>{
 if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/social/\nSitemap: '+CANONICAL_ORIGIN+'/sitemap.xml\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=60'}});
 const chunk=url.pathname.match(/^\/sitemaps\/(posts|writers)-(\d+)\.xml$/),index=url.pathname==='/sitemap.xml',pages=url.pathname==='/sitemaps/pages.xml';
 if(!chunk&&!index&&!pages)return null;
 const headers={'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60'};
 if(pages)return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+CANONICAL_ORIGIN+'/</loc></url></urlset>',{headers});
 try{
  const response=await env.API.fetch(new Request(CANONICAL_ORIGIN+'/api/seo/sitemap'+(chunk?'?'+new URLSearchParams({kind:chunk[1],page:chunk[2]}):'')));
  if(!response.ok)return new Response('Sitemap unavailable',{status:response.status===404?404:503,headers:{'Cache-Control':'no-store'}});
  const data:any=await response.json();
  if(index){const paths=['/sitemaps/pages.xml',...['posts','writers'].flatMap(kind=>Array.from({length:Math.ceil(data[kind]/1000)},(_,i)=>'/sitemaps/'+kind+'-'+i+'.xml'))];return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(path=>'<sitemap><loc>'+htmlEscape(absolute(path))+'</loc></sitemap>').join('')+'</sitemapindex>',{headers});}
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+data.pages.map((page:any)=>'<url><loc>'+htmlEscape(absolute(page.path))+'</loc>'+(page.updated_at?'<lastmod>'+new Date(page.updated_at*1000).toISOString()+'</lastmod>':'')+'</url>').join('')+'</urlset>',{headers});
 }catch{return new Response('Sitemap unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
