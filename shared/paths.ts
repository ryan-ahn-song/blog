type WriterLink={id?:string;username?:string|null};
type PostLink={id:string;author_id?:string;author_username?:string|null;writer?:WriterLink};
export const fallbackUsername=(id:string)=>'user-'+id;
export const writerPath=(writer:WriterLink)=>'/'+encodeURIComponent(writer.username||fallbackUsername(writer.id??''));
export const postPath=(post:PostLink)=>writerPath(post.writer??{id:post.author_id,username:post.author_username})+'/posts/'+encodeURIComponent(post.id);
export function pageRoute(pathname:string,hash=''){
  const legacyPost=hash.match(/^#post-([\w-]+)$/),legacyWriter=hash.match(/^#writer-([\w-]+)$/);
  if(legacyPost)return {type:'post',id:legacyPost[1],legacy:true};
  if(legacyWriter)return {type:'writer',id:legacyWriter[1],legacy:true};
  const post=pathname.match(/^\/([^/]+)\/posts\/([\w-]+)\/?$/),writer=pathname.match(/^\/([^/]+)\/?$/);
  try{if(post)return {type:'post',id:post[2],username:decodeURIComponent(post[1])};if(writer)return {type:'writer',username:decodeURIComponent(writer[1])};}catch{return {type:'missing'};}
  return {type:pathname==='/'?'home':'missing'};
}
