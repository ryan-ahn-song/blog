type WriterLink={id?:string;username?:string|null};
type PostLink={id:string;author_id?:string;author_username?:string|null;writer?:WriterLink};
export const viewPaths={home:'/home',search:'/search',writers:'/people',saved:'/bookmark',write:'/write','my-posts':'/my-posts',subscriptions:'/subscriptions',admin:'/admin'} as const;
export type AppView=keyof typeof viewPaths;
export const viewUsernames=Object.values(viewPaths).map(path=>path.slice(1));
export const viewPath=(view:string)=>(viewPaths as Record<string,string>)[view]??viewPaths.home;
export function viewUrl(view:string,{query='',category='all',topicId='all',editId=null}:{query?:string;category?:string;topicId?:string;editId?:string|null}={}){
  const params=new URLSearchParams();
  if(view==='search'){if(query)params.set('q',query);if(topicId!=='all')params.set('topic',topicId);}
  if(['home','search'].includes(view)&&category!=='all')params.set('category',category);
  if(view==='write'&&editId)params.set('post',editId);
  return viewPath(view)+(params.size?'?'+params:'');
}
export const fallbackUsername=(id:string)=>'user-'+id;
export const writerPath=(writer:WriterLink)=>{const name=writer.username||fallbackUsername(writer.id??'');return '/'+(viewUsernames.includes(name.normalize('NFKC').toLowerCase())?'@':'')+encodeURIComponent(name);};
export const postPath=(post:PostLink)=>writerPath(post.writer??{id:post.author_id,username:post.author_username})+'/posts/'+encodeURIComponent(post.id);
type PageRoute={type:'view';view:AppView}|{type:'post';id:string;username?:string;legacy?:boolean}|{type:'writer';id?:string;username?:string;legacy?:boolean}|{type:'missing'};
export function pageRoute(pathname='/',hash=''):PageRoute{
  const legacyPost=hash.match(/^#post-([\w-]+)$/),legacyWriter=hash.match(/^#writer-([\w-]+)$/);
  if(legacyPost)return {type:'post',id:legacyPost[1],legacy:true};
  if(legacyWriter)return {type:'writer',id:legacyWriter[1],legacy:true};
  const clean=pathname==='/'?'/home':pathname.replace(/\/$/,'');
  const view=Object.entries(viewPaths).find(([,path])=>path===clean)?.[0] as AppView|undefined;
  if(view)return {type:'view',view};
  const post=pathname.match(/^\/([^/]+)\/posts\/([\w-]+)\/?$/),writer=pathname.match(/^\/([^/]+)\/?$/);
  try{if(post)return {type:'post',id:post[2],username:decodeURIComponent(post[1]).replace(/^@/,'')};if(writer)return {type:'writer',username:decodeURIComponent(writer[1]).replace(/^@/,'')};}catch{return {type:'missing'};}
  return {type:'missing'};
}
