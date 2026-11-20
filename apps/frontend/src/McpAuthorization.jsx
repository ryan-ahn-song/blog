import {useEffect,useState} from 'react';
import {api,jsonRequest,setApiScope} from './api';
import {restoreAccount} from './auth-state';
import AuthDialog from './AuthDialog';
import SignupDialog,{LegalDocuments} from './SignupDialog';
import UsernameSetup from './UsernameSetup';
import './mcp.css';

export default function McpAuthorization(){
  const flow=new URLSearchParams(location.search).get('request')??'';
  useEffect(()=>{document.title='앱 연결 | 21st ARK';},[]);
  const [data,setData]=useState(null),[user,setUser]=useState(null),[signup,setSignup]=useState(null),[selected,setSelected]=useState([]),[error,setError]=useState(''),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[login,setLogin]=useState(false),[legal,setLegal]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setChecking(true);setError('');
    async function load(){
      try{
        const account=await restoreAccount(controller.signal);if(controller.signal.aborted)return;
        setUser(account.user);setSignup(account.signup??null);setApiScope(account.user?account.user.id+':'+account.user.role+':'+account.user.version:'anonymous');
        const result=await api('/api/mcp/authorization/'+encodeURIComponent(flow),{signal:controller.signal});if(controller.signal.aborted)return;
        setData(result);setSelected([...new Set(['account:read',...result.requested_scopes])].filter(scope=>result.available_scopes.includes(scope)));
        if(new URLSearchParams(location.search).has('auth_error'))setError('로그인을 완료하지 못했습니다. 다시 로그인해 주세요.');
      }catch(e){if(!controller.signal.aborted)setError(e.message);}finally{if(!controller.signal.aborted)setChecking(false);}
    }
    load();return()=>controller.abort();
  },[flow,retry]);
  async function decide(approve){
    if(busy||!data)return;setBusy(true);setError('');
    try{
      const result=await api('/api/mcp/authorization/'+encodeURIComponent(flow),jsonRequest('POST',{approve,scopes:selected,user_id:user?.id}));
      // Only an HTTP(S) redirect validated and stored by our OAuth server is used.
      const target=new URL(result.redirect);if(!['https:','http:'].includes(target.protocol))throw new Error('연결 앱의 돌아갈 주소를 확인해 주세요.');
      location.assign(target.href);
    }catch(e){setError(e.message);setBusy(false);}
  }
  function completed(){setSignup(null);setLogin(false);setRetry(n=>n+1);}
  return <main className="mcp-connect" tabIndex={0} aria-labelledby="mcp-consent-title">
    <header><a href="/home" aria-label="21st ARK 홈">21st ARK</a><span>앱 연결</span></header>
    <section className="mcp-consent" aria-labelledby="mcp-consent-title">
      <p className="mcp-eyebrow">계정 접근 권한</p><h1 id="mcp-consent-title">{data?<>이 앱을<br/>연결할까요?</>:'연결 요청 확인'}</h1>
      {checking?<p role="status" className="settings-note">계정과 연결 앱을 확인하고 있어요.</p>:data?<>
        <div className="mcp-client"><strong>{data.client.clientName}</strong><span>{data.client.clientDomain??'앱에서 직접 등록한 이름 · 신원 미확인'}</span></div>
        <p className="mcp-destination">승인 결과를 받을 주소 <strong>{data.client.redirectHost}</strong></p>
        {data.client.redirectIsLoopback&&<p className="mcp-warning">내 컴퓨터의 앱에 접근 권한을 전달합니다. 방금 직접 연결을 시작한 앱인지 확인해 주세요.</p>}
        {user?<>
          <p className="mcp-identity"><strong>{user.name}</strong> 계정으로 연결합니다.</p>
          <fieldset disabled={busy} className="mcp-scope-list"><legend>허용할 권한</legend>{data.available_scopes.map(scope=><label key={scope}><input type="checkbox" checked={selected.includes(scope)} disabled={scope==='account:read'} onChange={event=>setSelected(previous=>event.target.checked?[...previous,scope]:previous.filter(item=>item!==scope))}/><span>{data.scopes[scope]}{scope==='account:read'&&<small>연결에 필요한 기본 권한</small>}</span></label>)}</fieldset>
          <p className="mcp-human-only">AI는 초안만 저장할 수 있습니다.<br/>공개 업로드는 웹에서 직접 진행해 주세요.</p>
          <p className="settings-note">허용한 정보는 연결 앱으로 전달됩니다. 앱이 이미 가져간 정보는 연결을 해제해도 회수할 수 없어요. 토큰 갱신을 허용하면 최대 30일, 허용하지 않으면 최대 10분 동안 연결됩니다. 계정 및 설정 → 연결된 앱에서 언제든 해제할 수 있습니다.</p>
        </>:<><p className="settings-note">블로그 계정으로 로그인한 뒤 허용할 권한을 선택해 주세요.</p><button className="pill primary" onClick={()=>setLogin(true)}>로그인하고 계속하기</button></>}
        <div className="mcp-consent-actions"><button className="pill" disabled={busy} onClick={()=>decide(false)}>거절</button>{user&&<button className="pill primary" disabled={busy||checking||user.needs_username||!selected.includes('account:read')} onClick={()=>decide(true)}>{busy?'연결 중…':'선택한 권한으로 연결'}</button>}</div>
      </>:<p className="settings-note">AI 앱에서 MCP 연결을 다시 시작해 주세요.</p>}
      {error&&<p className="auth-error" role="alert">{error} <button className="text-button" disabled={busy} onClick={()=>setRetry(n=>n+1)}>다시 확인</button></p>}
      <a className="mcp-home" href="/home">홈으로 돌아가기 ↗</a>
    </section>
    <AuthDialog mcpRequest={flow} open={login&&!signup} onClose={()=>setLogin(false)} user={user} checking={checking} refresh={()=>setRetry(n=>n+1)} onLegal={()=>{setLogin(false);setLegal(true);}}/>
    {signup&&<SignupDialog signup={signup} onComplete={completed} onCancel={()=>{setSignup(null);setLogin(false);}}/>}
    {user?.needs_username&&!signup&&<UsernameSetup user={user} onSaved={completed} onLogout={async()=>{await api('/api/auth/logout',jsonRequest('POST',{}));completed();}}/>}
    {legal&&<section className="mcp-legal"><button className="pill" onClick={()=>setLegal(false)}>약관 닫기</button><LegalDocuments/></section>}
  </main>;
}
