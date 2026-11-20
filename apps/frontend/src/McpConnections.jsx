import {useEffect,useState} from 'react';
import {api,jsonRequest} from './api';
import './mcp.css';
const labels={get_account:'내 계정 조회',get_writing_guide:'작성 가이드 조회',list_posts:'포스트 목록 조회',get_post:'포스트 본문 조회',get_categories:'분류 조회',create_label:'분류·태그 생성',create_draft:'초안 생성',update_draft:'초안 수정',upload_image:'이미지 업로드',get_analytics:'통계 조회'};
const date=value=>new Date(value*1000).toLocaleString('ko-KR');
export default function McpConnections({user,disabled,onBusy}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  useEffect(()=>{const controller=new AbortController();setError('');api('/api/mcp/connections',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[user.id,retry]);
  async function revoke(){if(busy||!confirm)return;setBusy(true);onBusy?.(true);setError('');try{await api('/api/mcp/connections/'+confirm.id,jsonRequest('DELETE',{}));setConfirm(null);setRetry(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);onBusy?.(false);}}
  async function copy(){try{await navigator.clipboard.writeText(data.endpoint);setCopied(true);}catch{setError('주소를 복사하지 못했어요. 아래 주소를 직접 복사해 주세요.');}}
  return <section className="settings-section mcp-settings" aria-labelledby="mcp-connections-title"><h3 id="mcp-connections-title">연결된 앱</h3><p className="settings-note">AI 앱에서 내 계정을 연결해 포스트를 조회하고 초안을 작성할 수 있어요. 공개 업로드는 웹에서 직접 진행합니다.</p>
    {data?<><div className="mcp-endpoint"><code>{data.endpoint}</code><button className="text-button" disabled={busy||disabled} onClick={copy}>{copied?'복사됨':'주소 복사'}</button></div>
      {!data.connections.length?<p className="settings-note">연결된 앱이 없습니다.</p>:data.connections.map(connection=><article className="mcp-connection" key={connection.id}><div><strong>{connection.client_name}</strong><span>{connection.active?'연결됨':connection.revoked_at?'연결 해제됨':'만료됨'}</span></div><p>{connection.client_domain??connection.redirect_host}</p><details><summary>허용한 권한과 연결 정보</summary><ul>{connection.scope.map(scope=><li key={scope}>{data.scopes[scope]??scope}</li>)}</ul><p>연결: {date(connection.created_at)}<br/>만료: {date(connection.expires_at)}{connection.last_used_at&&<><br/>최근 사용: {date(connection.last_used_at)}</>}</p></details>{connection.active&&<button className="text-button" disabled={busy||disabled} onClick={()=>setConfirm(connection)}>연결 해제</button>}</article>)}
      {confirm&&<div className="mcp-revoke"><strong>{confirm.client_name} 연결을 해제할까요?</strong><p>이 앱은 더 이상 계정에 접근하거나 초안을 저장할 수 없습니다. 이미 저장한 초안은 유지됩니다.</p><div><button className="pill" disabled={busy} onClick={()=>setConfirm(null)}>취소</button><button className="pill danger-outline" disabled={busy} onClick={revoke}>{busy?'해제 중…':'연결 해제 확인'}</button></div></div>}
      {!!data.activity.length&&<details className="mcp-activity"><summary>최근 앱 활동</summary><ol>{data.activity.map(event=><li key={event.id}><strong>{labels[event.tool]??event.tool}</strong><span>{event.client_name} · {event.outcome==='ok'?'완료':'실패'}<br/>{date(event.created_at)}</span></li>)}</ol></details>}
    </>:!error&&<p className="settings-note" role="status">연결된 앱을 불러오고 있어요.</p>}
    {error&&<p className="auth-error" role="alert">{error} <button className="text-button" disabled={busy||disabled} onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>}
  </section>;
}
