import {useEffect,useState} from 'react';
import {api,jsonRequest} from './api';
import UsernameField from './UsernameField';

export default function UsernameSettings({user,disabled,onSaved,onBusy}){
  const [username,setUsername]=useState(user.needs_username?'':user.username??'');
  const [valid,setValid]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{setUsername(user.needs_username?'':user.username??'');},[user.id,user.version]);
  async function submit(event){
    event.preventDefault();if(disabled||pending||!valid)return;
    setPending(true);onBusy(true);setError('');setNotice('');
    try{
      const result=await api('/api/auth/profile',jsonRequest('PATCH',{name:user.name,bio:user.bio??'',username,version:user.version}));
      onSaved(result.user);setNotice('유저네임을 저장했습니다.');
    }catch(e){setError(e.message);}finally{setPending(false);onBusy(false);}
  }
  return <section className="settings-section settings-username" aria-labelledby="settings-username-title"><h3 id="settings-username-title">유저네임</h3><p className="settings-note">프로필과 포스트 주소에 사용합니다. 표시 이름은 내 프로필에서 변경할 수 있어요.</p><form onSubmit={submit}><fieldset disabled={disabled||pending}><UsernameField value={username} onChange={value=>{setUsername(value);setNotice('');}} onValidityChange={setValid} knownUsername={user.needs_username?'':user.username} disabled={disabled||pending}/>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="workspace-notice" role="status">{notice}</p>}<button className="pill" disabled={disabled||pending||!valid||username===user.username}>{pending?'저장 중…':'유저네임 저장'}</button></fieldset></form></section>;
}
