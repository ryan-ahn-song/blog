import {useEffect,useRef,useState} from 'react';
import UsernameField from './UsernameField';
import {api,jsonRequest} from './api';
export default function UsernameSetup({user,onSaved,onLogout}){
  const dialog=useRef(null),[username,setUsername]=useState(''),[valid,setValid]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{dialog.current.showModal();},[]);
  async function submit(event){event.preventDefault();if(!valid||busy)return;setBusy(true);setError('');try{const result=await api('/api/auth/profile',jsonRequest('PATCH',{name:user.name,bio:user.bio??'',username,version:user.version}));onSaved(result.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <dialog ref={dialog} className="auth-dialog username-setup" aria-labelledby="username-setup-title" onCancel={event=>event.preventDefault()}><p className="auth-brand">21st ARK</p><h2 id="username-setup-title">나만의 주소를 정해 주세요</h2><p className="auth-description">프로필과 포스트 주소에 사용할 유저네임입니다.<br/>계정 및 설정에서 나중에 변경할 수 있어요.</p><form onSubmit={submit}><UsernameField value={username} onChange={setUsername} onValidityChange={setValid} disabled={busy}/>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="pill primary auth-submit" disabled={!valid||busy}>{busy?'저장 중…':'유저네임 저장'}</button><button type="button" className="text-button signup-cancel" disabled={busy} onClick={onLogout}>로그아웃</button></form></dialog>;
}
