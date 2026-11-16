import { randomUUID } from 'node:crypto';
import { json, readBody, HttpError } from './http';
import { type AuthEnv, requireUser, checkOrigin, now, limited, digest } from './session';
export const applicationConsentVersion='2026-11-16.1';
type Application={id:string;user_id:string;display_name:string;email:string;introduction:string;topic_ids:string;plan:string;portfolio_url:string|null;status:string;review_note:string;reviewed_at:number|null;created_at:number;version:number;consent_version:string;consented_at:number};
const columns='id,user_id,display_name,email,introduction,topic_ids,plan,portfolio_url,status,review_note,reviewed_at,created_at,version,consent_version,consented_at';
function data(row:Application){return {...row,topic_ids:JSON.parse(row.topic_ids)};}
const consent={version:applicationConsentVersion,purpose:'작성자 신청 접수·심사 및 결과 안내',items:'표시 이름, 로그인 이메일, 자기소개, 포스트 분류·작성 계획, 선택한 포트폴리오 링크, 신청·동의·심사 이력',retention:'회원 탈퇴 시까지',refusal:'동의를 거부할 수 있으며, 거부하면 작성자 신청을 접수할 수 없습니다. 포스트 열람은 계속 가능합니다.'};
export async function handleApplications(request:Request,env:AuthEnv){
  const actor=await requireUser(request,env),url=new URL(request.url),admin=url.pathname.startsWith('/api/admin/');
  if(admin&&actor.role!=='admin')throw new HttpError(403,'관리자만 신청서를 확인할 수 있습니다.');
  if(request.method==='GET'){
    if(!admin){const rows=await env.DB.prepare('SELECT '+columns+' FROM writer_applications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 10').bind(actor.id).all<Application>();return json({applications:rows.results.map(data),consent});}
    const status=url.searchParams.get('status')??'pending',page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0))|0;
    if(!['all','pending','approved','rejected'].includes(status))throw new HttpError(400,'신청 상태를 확인해 주세요.');
    const where=" WHERE (?='all' OR status=?)";
    const rows=await env.DB.prepare('SELECT '+columns+' FROM writer_applications'+where+' ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').bind(status,status,page*20).all<Application>();
    const count=await env.DB.prepare('SELECT count(*) AS total FROM writer_applications'+where).bind(status,status).first<{total:number}>();
    return json({applications:rows.results.map(data),total:count?.total??0,page});
  }
  if((!admin&&request.method!=='POST')||(admin&&request.method!=='PATCH'))return json({error:'지원하지 않는 요청입니다.'},405,{Allow:admin?'GET, PATCH':'GET, POST'});
  checkOrigin(request);const body=await readBody(request,24000);
  if(!admin){
    if(actor.role!=='reader')throw new HttpError(403,'일반 열람자만 작성자 신청을 할 수 있습니다.');
    if(typeof body.introduction!=='string'||!body.introduction.trim()||body.introduction.length>1000||typeof body.plan!=='string'||!body.plan.trim()||body.plan.length>2000||/\0/.test(body.introduction+body.plan))throw new HttpError(400,'자기소개(1,000자)와 작성 계획(2,000자)을 확인해 주세요.');
    if(body.consent!==true||body.consent_version!==applicationConsentVersion)throw new HttpError(400,'신청서 개인정보 수집·이용 안내를 확인하고 동의해 주세요.');
    if(!Array.isArray(body.topic_ids)||!body.topic_ids.length||body.topic_ids.length>8||body.topic_ids.some(id=>typeof id!=='string'))throw new HttpError(400,'작성할 포스트 분류를 선택해 주세요.');
    const topics=[...new Set(body.topic_ids as string[])],catalog=await env.DB.prepare('SELECT id FROM topics').all<{id:string}>();
    if(topics.some(id=>!catalog.results.some(topic=>topic.id===id)))throw new HttpError(400,'포스트 분류를 다시 선택해 주세요.');
    let portfolio:string|null=null;
    if(body.portfolio_url!==undefined&&body.portfolio_url!==''){
      if(typeof body.portfolio_url!=='string'||body.portfolio_url.length>500)throw new HttpError(400,'포트폴리오 링크를 확인해 주세요.');
      try{const link=new URL(body.portfolio_url);if(link.protocol!=='https:'||link.username||link.password)throw new Error();portfolio=link.href;}catch{throw new HttpError(400,'포트폴리오는 https 주소로 입력해 주세요.');}
    }
    if(await limited(env.DB,digest('writer-application:'+actor.id),10))throw new HttpError(429,'신청 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    const id=randomUUID();
    const row=await env.DB.prepare("INSERT INTO writer_applications(id,user_id,display_name,email,introduction,topic_ids,plan,portfolio_url,consent_version,consented_at) SELECT ?,u.id,u.name,u.email,?,?,?,?,?,? FROM auth_users u WHERE u.id=? AND u.role='reader' AND u.disabled=0 AND NOT EXISTS(SELECT 1 FROM writer_applications a WHERE a.user_id=u.id AND a.status='pending') RETURNING "+columns).bind(id,body.introduction.trim(),JSON.stringify(topics),body.plan.trim(),portfolio,applicationConsentVersion,now(),actor.id).first<Application>();
    if(!row)throw new HttpError(409,'이미 검토 중인 신청이 있거나 권한이 변경되었습니다. 새로고침해 주세요.');
    return json({application:data(row)},201);
  }
  const id=url.pathname.match(/^\/api\/admin\/writer-applications\/([\w-]+)$/)?.[1];
  if(!id)throw new HttpError(404,'신청서를 찾을 수 없습니다.');
  if(!['approved','rejected'].includes(String(body.status))||typeof body.version!=='number'||!Number.isSafeInteger(body.version)||typeof body.review_note!=='string'||body.review_note.length>1000||body.review_note.includes('\0')||(body.status==='rejected'&&!body.review_note.trim()))throw new HttpError(400,'심사 결과와 반려 사유(1,000자 이내)를 확인해 주세요.');
  const token=randomUUID();
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE writer_applications SET status=?,review_note=?,reviewed_by=?,reviewed_at=?,version=version+1,decision_token=? WHERE id=? AND version=? AND status='pending' AND EXISTS(SELECT 1 FROM auth_users WHERE id=? AND role='admin' AND disabled=0) AND (?='rejected' OR EXISTS(SELECT 1 FROM auth_users WHERE id=writer_applications.user_id AND role='reader' AND disabled=0)) RETURNING "+columns).bind(body.status,body.review_note.trim(),actor.id,now(),token,id,body.version,actor.id,body.status),
    env.DB.prepare("UPDATE auth_users SET role='author',version=version+1 WHERE role='reader' AND disabled=0 AND id=(SELECT user_id FROM writer_applications WHERE id=? AND decision_token=? AND status='approved')").bind(id,token),
  ]);
  const row=result[0].results[0] as Application|undefined;
  if(!row)throw new HttpError(409,'신청서 또는 회원 권한이 변경되었습니다. 새로고침해 주세요.');
  return json({application:data(row)});
}
