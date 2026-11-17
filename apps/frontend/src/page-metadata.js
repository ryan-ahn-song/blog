import {writerPath,postPath,viewPath} from '../../../shared/paths';
import {CANONICAL_ORIGIN} from '../../../shared/site';
export function setPageMetadata({article,author,view,routeError}){
  const published=article?.status==='published',profile=!article&&view==='author'&&author?.username;
  const path=article?postPath(article):profile?writerPath(author):viewPath(view),url=new URL(path,CANONICAL_ORIGIN).href;
  const title=article?.title||(profile?author.name:'21st ARK'),description=(article?.summary||(profile?author.bio:'')||'개발과 기술, 일상과 에세이의 포스트를 읽고 나눠 보세요.').slice(0,240);
  const image=new URL(published&&article.image_key?'/api/social/posts/'+article.id+'/image':profile&&(author.cover_url||author.avatar_url)?'/api/social/writers/'+author.id+'/image':'/assets/social-default.png',CANONICAL_ORIGIN).href;
  let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=url;
  function meta(key,value,property=false){let element=document.head.querySelector('meta['+(property?'property':'name')+'="'+key+'"]');if(!element){element=document.createElement('meta');element.setAttribute(property?'property':'name',key);document.head.append(element);}element.content=value;}
  for(const [key,value]of Object.entries({'og:title':title+' | 21st ARK','og:description':description,'og:url':url,'og:image':image,'og:image:secure_url':image,'og:image:alt':article?.title||(profile?author.name:'21st ARK'),'og:type':article?'article':profile?'profile':'website'}))meta(key,value,true);
  for(const [key,value]of Object.entries({'description':description,'twitter:card':'summary_large_image','twitter:title':title+' | 21st ARK','twitter:description':description,'twitter:image':image,'robots':routeError||(article&&!published)||(!article&&!profile&&!['home','writers'].includes(view))?'noindex,nofollow':'index,follow,max-image-preview:large'}))meta(key,value);
  document.getElementById('client-schema')?.remove();document.querySelectorAll('script[type="application/ld+json"]').forEach(node=>node.remove());
  const schema=published?{'@context':'https://schema.org','@type':'BlogPosting',headline:article.title,description,url,mainEntityOfPage:url,image,author:{'@type':'Person',name:article.writer.name,url:new URL(writerPath(article.writer),CANONICAL_ORIGIN).href},...(article.published_at?{datePublished:new Date(article.published_at*1000).toISOString()}:{}),...(article.updated_at?{dateModified:new Date(article.updated_at*1000).toISOString()}:{} )}:profile?{'@context':'https://schema.org','@type':'ProfilePage',url,mainEntity:{'@type':'Person',name:author.name,identifier:author.username,url}}:null;
  if(schema){const element=document.createElement('script');element.id='client-schema';element.type='application/ld+json';element.textContent=JSON.stringify(schema);document.head.append(element);}
}
