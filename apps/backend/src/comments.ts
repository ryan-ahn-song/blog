import {randomUUID} from 'node:crypto';
import {HttpError,json,readBody} from './http';
import {type AuthEnv,currentUser,requireUser,checkOrigin,limited,digest,now} from './session';
import {mediaUrl} from './media';

type Env=AuthEnv&{MEDIA_BASE_URL?:string};
type CommentRow={id:string;post_id:string;author_id:string;body:string;revision:number;created_at:number;updated_at:number;name:string;avatar_key:string|null};
const activePost="SELECT p.id FROM posts p JOIN auth_users w ON w.id=p.author_id WHERE p.id=? AND p.status='published' AND w.disabled=0";
const selection="SELECT c.id,c.post_id,c.author_id,c.body,c.revision,c.created_at,c.updated_at,u.name,u.avatar_key FROM post_comments c JOIN auth_users u ON u.id=c.author_id JOIN posts p ON p.id=c.post_id JOIN auth_users w ON w.id=p.author_id";
const visible="c.post_id=? AND u.disabled=0 AND p.status='published' AND w.disabled=0";
function commentData(row:CommentRow,request:Request,env:Env,actor:{id:string;role:string}|null){
  return {id:row.id,post_id:row.post_id,body:row.body,revision:row.revision,created_at:row.created_at,updated_at:row.updated_at,writer:{id:row.author_id,name:row.name,avatar_url:mediaUrl(row.avatar_key,request,env)},can_edit:actor?.id===row.author_id,can_delete:Boolean(actor&&(actor.id===row.author_id||actor.role==='admin'))};
}
export async function handleComments(request:Request,env:Env){
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/posts\/([\w-]+)\/comments(?:\/([\w-]+))?$/)!;
  const postId=match[1],commentId=match[2];
  if(!((request.method==='GET'&&!commentId)||(request.method==='POST'&&!commentId)||(['PATCH','DELETE'].includes(request.method)&&commentId)))return json({error:'지원하지 않는 요청입니다.'},405,{Allow:commentId?'PATCH, DELETE':'GET, POST'});
  if(!await env.DB.prepare(activePost).bind(postId).first())throw new HttpError(404,'댓글을 볼 수 있는 포스트를 찾을 수 없습니다.');
  if(request.method==='GET'){
    const actor=await currentUser(request,env),cursor=url.searchParams.get('cursor');
    const values:(string|number)[]=[postId];let where=visible;
    if(cursor){const parts=cursor.match(/^(\d{1,12}):([\w-]{1,100})$/);if(!parts)throw new HttpError(400,'댓글 페이지를 확인해 주세요.');where+=' AND (c.created_at<? OR (c.created_at=? AND c.id<?))';values.push(Number(parts[1]),Number(parts[1]),parts[2]);}
    const rows=await env.DB.prepare(selection+' WHERE '+where+' ORDER BY c.created_at DESC,c.id DESC LIMIT 21').bind(...values).all<CommentRow>();
    const count=await env.DB.prepare('SELECT count(*) AS total FROM post_comments c JOIN auth_users u ON u.id=c.author_id JOIN posts p ON p.id=c.post_id JOIN auth_users w ON w.id=p.author_id WHERE '+visible).bind(postId).first<{total:number}>();
    const comments=rows.results.slice(0,20),last=comments.at(-1);
    return json({comments:comments.map(row=>commentData(row,request,env,actor)),total:count?.total??0,next_cursor:rows.results.length>20&&last?last.created_at+':'+last.id:null});
  }
  checkOrigin(request);const actor=await requireUser(request,env);
  if(await limited(env.DB,digest('comments:'+actor.id),60))throw new HttpError(429,'댓글 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const body=await readBody(request,16000);
  if(request.method!=='DELETE'&&(typeof body.body!=='string'||!body.body.trim()||body.body.length>3000||body.body.includes('\0')))throw new HttpError(400,'댓글을 3,000자 이내로 입력해 주세요.');
  if(commentId){
    if(typeof body.revision!=='number'||!Number.isSafeInteger(body.revision)||body.revision<1)throw new HttpError(400,'댓글 버전을 확인해 주세요.');
    const existing=await env.DB.prepare('SELECT author_id FROM post_comments WHERE id=? AND post_id=?').bind(commentId,postId).first<{author_id:string}>();
    if(!existing)throw new HttpError(404,'댓글을 찾을 수 없습니다.');
    if(existing.author_id!==actor.id&&(request.method!=='DELETE'||actor.role!=='admin'))throw new HttpError(403,request.method==='DELETE'?'본인의 댓글만 삭제할 수 있습니다.':'본인의 댓글만 수정할 수 있습니다.');
    if(request.method==='DELETE'){
      const deleted=await env.DB.prepare('DELETE FROM post_comments WHERE id=? AND post_id=? AND revision=? AND EXISTS('+activePost+') RETURNING id').bind(commentId,postId,body.revision,postId).first();
      if(!deleted)throw new HttpError(409,'댓글이나 포스트가 변경되었습니다. 새로고침 후 다시 삭제해 주세요.');
      return json({deleted:true,id:commentId});
    }
    const updated=await env.DB.prepare('UPDATE post_comments SET body=?,updated_at=?,revision=revision+1 WHERE id=? AND post_id=? AND revision=? AND author_id=? AND EXISTS('+activePost+') RETURNING id').bind((body.body as string).replace(/\r\n?/g,'\n').trim(),now(),commentId,postId,body.revision,actor.id,postId).first();
    if(!updated)throw new HttpError(409,'댓글이나 포스트가 변경되었습니다. 수정 내용을 복사해 두고 다시 열어 주세요.');
    const row=await env.DB.prepare(selection+' WHERE '+visible+' AND c.id=?').bind(postId,commentId).first<CommentRow>();
    return json({comment:row?commentData(row,request,env,actor):null});
  }
  const id=randomUUID();
  const created=await env.DB.prepare("INSERT INTO post_comments(id,post_id,author_id,body) SELECT ?,p.id,?,? FROM posts p JOIN auth_users w ON w.id=p.author_id WHERE p.id=? AND p.status='published' AND w.disabled=0 AND EXISTS(SELECT 1 FROM auth_users a WHERE a.id=? AND a.disabled=0) RETURNING id").bind(id,actor.id,(body.body as string).replace(/\r\n?/g,'\n').trim(),postId,actor.id).first();
  if(!created)throw new HttpError(404,'댓글을 작성할 수 있는 포스트를 찾을 수 없습니다.');
  const row=await env.DB.prepare(selection+' WHERE '+visible+' AND c.id=?').bind(postId,id).first<CommentRow>();
  return json({comment:row?commentData(row,request,env,actor):null},201);
}
