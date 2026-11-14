import { useEffect, useState } from 'react';
import { api, jsonRequest } from './api';
export default function ProfileForm({ user, onSaved }) {
  const [name,setName]=useState(user.name),[bio,setBio]=useState(user.bio??''),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{setName(user.name);setBio(user.bio??'');},[user.id,user.version]);
  async function submit(event){event.preventDefault();setPending(true);setError('');setNotice('');try{const result=await api('/api/auth/profile',jsonRequest('PATCH',{name,bio,version:user.version}));onSaved(result.user);setNotice('프로필을 저장했습니다.');}catch(e){setError(e.message);}finally{setPending(false);}}
  return <details className="profile-edit"><summary>프로필 수정</summary><form onSubmit={submit}><label htmlFor="profile-name">표시 이름</label><input id="profile-name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} disabled={pending}/><label htmlFor="profile-bio">소개 <span>선택 · 160자</span></label><textarea id="profile-bio" rows={3} maxLength={160} value={bio} onChange={e=>setBio(e.target.value)} disabled={pending}/>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="workspace-notice" role="status">{notice}</p>}<button className="pill auth-submit" disabled={pending}>{pending?'저장 중…':'프로필 저장'}</button></form></details>;
}
