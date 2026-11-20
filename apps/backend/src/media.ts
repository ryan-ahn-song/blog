export const postImageKey = /^posts\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/;
export const profileImageKey = /^profiles\/[\w-]+\/(avatar|cover)-[\w-]+\.(jpg|png|webp|gif)$/;
export const mediaContentType=(key:string)=>key.endsWith('.gif')?'image/gif':key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg';
export function mediaUrl(key: string | null, request: Request, env: { MEDIA_BASE_URL?: string }) {
  const local=['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
  return key ? '/api/media/' + key : null;
}
export function inlineImageKey(source:string,request:Request,env:{MEDIA_BASE_URL?:string}){
  let key:string|undefined;
  let url:URL;
  try{url=new URL(source,request.url);}catch{return null;}
  const origin=new URL(request.url).origin;
  if(url.origin===origin&&url.pathname.startsWith('/api/media/'))key=url.pathname.slice('/api/media/'.length);
  else if(env.MEDIA_BASE_URL&&source.startsWith(env.MEDIA_BASE_URL.replace(/\/$/,'')+'/'))key=source.slice(env.MEDIA_BASE_URL.replace(/\/$/,'').length+1);
  return key&&postImageKey.test(key)?key:null;
}
