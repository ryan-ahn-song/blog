import { randomUUID } from 'node:crypto';
import { HttpError,json,readBody } from './http';
import { type AuthEnv,currentUser,requireUser,checkOrigin,limited,digest } from './session';

type Label={id:string;writer_id:string;kind:'category'|'tag';name:string;post_count?:number};
export async function handleTaxonomy(request:Request,env:AuthEnv){
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/writers\/([\w-]+)\/taxonomy(?:\/([\w-]+))?$/)!;
  const writerId=match[1],labelId=match[2];
  if(request.method==='GET'&&!labelId){
    const actor=await currentUser(request,env),manage=url.searchParams.get('scope')==='manage';
    if(manage&&(!actor||(actor.id!==writerId&&actor.role!=='admin')))throw new HttpError(actor?403:401,'본인의 분류와 태그만 관리할 수 있습니다.');
    const writer=await env.DB.prepare("SELECT id FROM auth_users u WHERE u.id=? AND u.disabled=0 AND (u.role IN ('author','admin') OR u.id=? OR EXISTS(SELECT 1 FROM posts p WHERE p.author_id=u.id AND p.status='published'))").bind(writerId,actor?.id??'').first();
    if(!writer)throw new HttpError(404,'필자를 찾을 수 없습니다.');
    const count="(SELECT count(*) FROM post_writer_labels pl JOIN posts p ON p.id=pl.post_id WHERE pl.label_id=l.id AND p.status='published' AND p.kind='post')";
    const rows=await env.DB.prepare('SELECT l.id,l.kind,l.name,'+count+' AS post_count FROM writer_labels l WHERE l.writer_id=?'+(manage?'':' AND '+count+'>0')+' ORDER BY l.created_at,l.id').bind(writerId).all<Label>();
    return json({writer_id:writerId,categories:rows.results.filter(row=>row.kind==='category'),tags:rows.results.filter(row=>row.kind==='tag')});
  }
  if(!((request.method==='POST'&&!labelId)||(['PATCH','DELETE'].includes(request.method)&&labelId)))return json({error:'지원하지 않는 요청입니다.'},405);
  checkOrigin(request);const actor=await requireUser(request,env,['author','admin']);
  if(actor.id!==writerId)throw new HttpError(403,'본인의 분류와 태그만 변경할 수 있습니다.');
  if(await limited(env.DB,digest('taxonomy:'+actor.id),120))throw new HttpError(429,'변경 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const existing=labelId?await env.DB.prepare('SELECT id,writer_id,kind,name FROM writer_labels WHERE id=? AND writer_id=?').bind(labelId,writerId).first<Label>():null;
  if(labelId&&!existing)throw new HttpError(404,'분류 또는 태그를 찾을 수 없습니다.');
  if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM writer_labels WHERE id=? AND writer_id=?').bind(labelId,writerId).run();return json({deleted:true});}
  const body=await readBody(request),kind=existing?.kind??body.kind;
  if(!['category','tag'].includes(String(kind))||typeof body.name!=='string')throw new HttpError(400,'분류와 태그 이름을 확인해 주세요.');
  const name=body.name.normalize('NFKC').trim().replace(/\s+/g,' ').replace(kind==='tag'?/^#+/:/^$/,'').trim();
  if(!name||name.length>(kind==='tag'?30:40)||/[\u0000-\u001f\u007f]/.test(name))throw new HttpError(400,kind==='tag'?'태그는 30자 이내로 입력해 주세요.':'분류는 40자 이내로 입력해 주세요.');
  const nameKey=name.toLocaleLowerCase('en-US');
  const duplicate=await env.DB.prepare('SELECT id,kind,name FROM writer_labels WHERE writer_id=? AND kind=? AND name_key=?').bind(writerId,kind,nameKey).first<Label>();
  if(duplicate&&duplicate.id!==labelId){if(!labelId)return json({label:duplicate},200);throw new HttpError(409,'같은 이름의 분류 또는 태그가 있어요.');}
  if(labelId){await env.DB.prepare('UPDATE writer_labels SET name=?,name_key=? WHERE id=? AND writer_id=?').bind(name,nameKey,labelId,writerId).run();return json({label:{id:labelId,kind,name}});}
  const total=await env.DB.prepare('SELECT count(*) AS total FROM writer_labels WHERE writer_id=? AND kind=?').bind(writerId,kind).first<{total:number}>();
  if((total?.total??0)>=(kind==='category'?50:200))throw new HttpError(400,'개인 분류는 50개, 태그는 200개까지 만들 수 있어요.');
  const id=randomUUID();await env.DB.prepare('INSERT INTO writer_labels(id,writer_id,kind,name,name_key) VALUES(?,?,?,?,?)').bind(id,writerId,kind,name,nameKey).run();
  return json({label:{id,kind,name}},201);
}

export async function postLabels(db:D1Database,writerId:string,body:Record<string,unknown>,postId?:string):Promise<string[]>{
  const previous=postId?(await db.prepare('SELECT l.id,l.kind FROM post_writer_labels pl JOIN writer_labels l ON l.id=pl.label_id WHERE pl.post_id=?').bind(postId).all<Label>()).results:[];
  const category=body.writer_category_id===undefined?(previous.find(row=>row.kind==='category')?.id??null):body.writer_category_id;
  const tags=body.writer_tag_ids===undefined?previous.filter(row=>row.kind==='tag').map(row=>row.id):body.writer_tag_ids;
  if((category!==null&&typeof category!=='string')||!Array.isArray(tags)||tags.length>10||tags.some(id=>typeof id!=='string'||id.length>100)||(typeof category==='string'&&category.length>100))throw new HttpError(400,'개인 분류 1개와 태그 최대 10개를 선택해 주세요.');
  const ids=[...new Set([...(category?[category]:[]),...tags])];if(!ids.length)return [];
  const rows=await db.prepare('SELECT id,kind,writer_id FROM writer_labels WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all<Label>();
  if(ids.some(id=>!rows.results.some(row=>row.id===id&&row.writer_id===writerId&&row.kind===(id===category?'category':'tag'))))throw new HttpError(400,'이 필자의 분류와 태그를 다시 선택해 주세요.');
  return ids;
}
export function labelWrites(db:D1Database,postId:string,token:string,ids:string[]){
  return [db.prepare('DELETE FROM post_writer_labels WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND taxonomy_write_token=?)').bind(postId,postId,token),...ids.map(id=>db.prepare('INSERT INTO post_writer_labels(post_id,label_id,writer_id,kind) SELECT id,?,author_id,(SELECT kind FROM writer_labels WHERE id=?) FROM posts WHERE id=? AND taxonomy_write_token=?').bind(id,id,postId,token))];
}
