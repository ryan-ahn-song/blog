import {viewUsernames} from './paths';
const reserved=new Set([...viewUsernames,'api','assets','posts','writers','sitemaps','robots.txt','sitemap.xml','favicon.ico','auth','login','logout','signup','settings','saved','terms','privacy','404']);
export function usernameValue(value:unknown):string|null{
  if(typeof value!=='string')return null;
  const name=value.normalize('NFKC').trim();
  if(name.length<2||name.length>50||!/^\p{L}[\p{L}\p{N}_-]*$/u.test(name)||(reserved.has(name.toLowerCase())||name.toLowerCase().startsWith('user-')))return null;
  return name;
}
export const usernameKey=(value:string)=>value.normalize('NFKC').toLowerCase();
