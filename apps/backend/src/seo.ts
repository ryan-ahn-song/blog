import {json,HttpError} from './http';
import {type AuthEnv} from './session';
import {usernameKey} from '../../../shared/usernames';
import {writerPath,postPath} from '../../../shared/paths';
import {postImageKey,profileImageKey,mediaContentType} from './media';
type Env=AuthEnv&{MEDIA:R2Bucket};
const publicProfile="u.disabled=0";
const writerColumns="u.id,u.name,coalesce(u.username,'user-'||u.id) AS username,u.bio,u.avatar_key,u.cover_key";
type Writer={id:string;name:string;username:string;bio:string;avatar_key:string|null;cover_key:string|null};
type Post={id:string;title:string;summary:string;body:string;body_doc:string|null;body_format:string;image_key:string|null;kind:string;created_at:number;updated_at:number;published_at:number;author_id:string;author_name:string;author_username:string};
const postColumns="p.id,p.title,p.summary,p.body,p.body_doc,p.body_format,p.image_key,p.kind,p.created_at,p.updated_at,p.published_at,p.author_id,u.name AS author_name,coalesce(u.username,'user-'||u.id) AS author_username";
const simpleWriter=(w:Writer)=>({id:w.id,name:w.name,username:w.username,bio:w.bio,path:writerPath(w)});
const simplePost=(p:Post)=>({id:p.id,title:p.title,summary:p.summary,kind:p.kind,updated_at:p.updated_at,published_at:p.published_at,writer:{id:p.author_id,name:p.author_name,username:p.author_username},path:postPath(p)});
export async function publicPage(request:Request,env:Env){
 if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
 const params=new URL(request.url).searchParams,postId=params.get('post_id'),username=params.get('username');
 if(postId){
  if(!/^[\w-]{1,100}$/.test(postId))throw new HttpError(404,'포스트를 찾을 수 없습니다.');
  const post=await env.DB.prepare('SELECT '+postColumns+" FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0").bind(postId).first<Post>();
  if(!post)throw new HttpError(404,'포스트를 찾을 수 없습니다.');
  let doc=null;try{doc=post.body_doc?JSON.parse(post.body_doc):null;}catch{}
  return json({type:'post',...simplePost(post),body:post.body,body_format:post.body_format,body_doc:doc,image:post.image_key?'/api/social/posts/'+post.id+'/image':'/assets/social-default.png'});
 }
 if(username){
  if(username.length>100)throw new HttpError(404,'프로필을 찾을 수 없습니다.');
  const writer=await env.DB.prepare('SELECT '+writerColumns+' FROM username_aliases a JOIN auth_users u ON u.id=a.user_id WHERE a.username_key=? AND '+publicProfile).bind(usernameKey(username)).first<Writer>();
  if(!writer)throw new HttpError(404,'프로필을 찾을 수 없습니다.');
  const posts=await env.DB.prepare('SELECT '+postColumns+" FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.author_id=? AND p.status='published' AND u.disabled=0 ORDER BY p.published_at DESC,p.id LIMIT 20").bind(writer.id).all<Post>();
  return json({type:'writer',...simpleWriter(writer),image:writer.cover_key||writer.avatar_key?'/api/social/writers/'+writer.id+'/image':'/assets/social-default.png',posts:posts.results.map(simplePost)});
 }
 const [posts,writers]=await env.DB.batch([
  env.DB.prepare('SELECT '+postColumns+" FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.status='published' AND p.kind='post' AND u.disabled=0 ORDER BY p.published_at DESC,p.id LIMIT 20"),
  env.DB.prepare('SELECT '+writerColumns+' FROM auth_users u WHERE '+publicProfile+" AND u.role IN ('author','admin') ORDER BY u.created_at,u.id LIMIT 100"),
 ]);
 return json({type:'home',path:'/',posts:(posts.results as Post[]).map(simplePost),writers:(writers.results as Writer[]).map(simpleWriter)});
}
export async function socialImage(request:Request,env:Env){
 if(!['GET','HEAD'].includes(request.method))return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET, HEAD'});
 const match=new URL(request.url).pathname.match(/^\/api\/social\/(posts|writers)\/([\w-]+)\/image$/)!;
 let key:string|null=null;
 if(match[1]==='posts'){
  const row=await env.DB.prepare("SELECT p.image_key FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.id=? AND p.status='published' AND u.disabled=0").bind(match[2]).first<{image_key:string|null}>();key=row?.image_key??null;
 }else{
  const row=await env.DB.prepare('SELECT u.cover_key,u.avatar_key FROM auth_users u WHERE u.id=? AND '+publicProfile).bind(match[2]).first<{cover_key:string|null;avatar_key:string|null}>();key=row?.cover_key||row?.avatar_key||null;
 }
 if(!key||(!postImageKey.test(key)&&!profileImageKey.test(key)))throw new HttpError(404,'공개 이미지를 찾을 수 없습니다.');
 const object=await env.MEDIA.get(key);if(!object)throw new HttpError(404,'공개 이미지를 찾을 수 없습니다.');
 const headers=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':mediaContentType(key),'Content-Disposition':'inline'});
 return new Response(request.method==='HEAD'?null:object.body,{headers});
}
export async function sitemapData(request:Request,env:Env){
 if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
 const params=new URL(request.url).searchParams,kind=params.get('kind');
 if(!kind){const rows=await env.DB.batch<{total:number}>([env.DB.prepare("SELECT count(*) AS total FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.status='published' AND u.disabled=0"),env.DB.prepare('SELECT count(*) AS total FROM auth_users u WHERE '+publicProfile)]);return json({posts:rows[0].results[0].total,writers:rows[1].results[0].total});}
 const page=Number(params.get('page')??0);if(!['posts','writers'].includes(kind)||!Number.isInteger(page)||page<0||page>100000)throw new HttpError(404,'사이트맵을 찾을 수 없습니다.');
 if(kind==='posts'){
  const rows=await env.DB.prepare("SELECT p.id,p.author_id,coalesce(u.username,'user-'||u.id) AS author_username,p.updated_at FROM posts p JOIN auth_users u ON u.id=p.author_id WHERE p.status='published' AND u.disabled=0 ORDER BY p.id LIMIT 1000 OFFSET ?").bind(page*1000).all<Post>();
  return json({pages:rows.results.map(post=>({path:postPath(post),updated_at:post.updated_at}))});
 }
 const rows=await env.DB.prepare('SELECT '+writerColumns+' FROM auth_users u WHERE '+publicProfile+' ORDER BY u.id LIMIT 1000 OFFSET ?').bind(page*1000).all<Writer>();
 return json({pages:rows.results.map(writer=>({path:writerPath(writer)}))});
}
