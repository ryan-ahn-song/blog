import { useEffect, useRef, useState } from 'react';
import { api, jsonRequest, roleName } from './api';
function GoogleMark() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9V33A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.6a12 12 0 0 1 0-7.2V15H5.9a20.1 20.1 0 0 0 0 18l6.9-5.4Z"/><path fill="#EA4335" d="M24 12.2c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20.4 20.4 0 0 0 5.9 15l6.9 5.4c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>; }
export default function AuthDialog({open,onClose,user,setUser,checking,connectionError,refresh,onSignedIn,onNavigate,initialError}) {
  const dialog=useRef(null);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false),[providers,setProviders]=useState(null);
  useEffect(()=>{ if(open){setError(initialError||'');setPassword('');if(!dialog.current.open)dialog.current.showModal();}else if(dialog.current.open)dialog.current.close(); },[open,initialError]);
  useEffect(()=>{if(!open)return;let cancelled=false;setProviders(null);api('/api/auth/providers').then(p=>{if(!cancelled)setProviders(p);}).catch(()=>{if(!cancelled)setProviders({google:false});});return()=>{cancelled=true;};},[open]);
  async function submit(event) {
    event.preventDefault();setPending(true);setError('');
    try {
      const body=await api(user?'/api/auth/logout':'/api/auth/login',jsonRequest('POST',user?{}:{email,password}));
      setPassword('');setUser(body.user);onClose();if(body.user)onSignedIn(body.user);else onNavigate('home');
    }catch(e){setError(e.message);}finally{setPending(false);}
  }
  function navigate(view){onClose();onNavigate(view);}
  const googleUrl='/api/auth/google?origin='+encodeURIComponent(location.origin);
  return <dialog className="auth-dialog" ref={dialog} aria-labelledby="auth-title" onClose={()=>{setPassword('');onClose();}} onCancel={onClose}>
    <button type="button" className="auth-close" aria-label="프로필 닫기" onClick={onClose}>×</button>
    <p className="auth-brand">21st ARK</p><h2 id="auth-title">{user?'내 프로필':'반가워요'}</h2>
    {checking?<p className="auth-description" role="status">로그인 상태를 확인하고 있어요.</p>:connectionError?<><p className="auth-error" role="alert">로그인 서비스에 연결하지 못했습니다.</p><button className="pill" onClick={refresh}>다시 확인</button></>:user?<><div className="account-avatar">{user.name[0]}</div><strong className="account-name">{user.name}</strong><p className="account-email">{user.email}</p><span className="account-role">{roleName(user.role)}</span><div className="profile-links">{['author','admin'].includes(user.role)&&<><button className="pill primary" onClick={()=>navigate('write')}>글 쓰기</button><button className="pill" onClick={()=>navigate('my-posts')}>나의 글</button></>}{user.role==='admin'&&<button className="pill" onClick={()=>navigate('admin')}>멤버 관리</button>}</div>{user.role==='reader'&&<p className="auth-description">이야기를 읽고 함께해 주세요. 글을 쓰고 싶다면 관리자에게 작성자 권한을 요청해 주세요.</p>}{providers?.google&&<a className="text-button account-link" href={googleUrl}>동일 이메일의 Google 계정 연결</a>}<form onSubmit={submit}><button className="pill auth-submit" disabled={pending}>{pending?'로그아웃 중…':'로그아웃'}</button></form></>:<>
      <p className="auth-description">Google 계정으로 로그인하고<br/>당신의 이야기를 함께 나눠 보세요.</p>
      {providers?.google?<a className="google-signin" href={googleUrl}><GoogleMark/><span>Google 계정으로 계속하기</span></a>:<button className="google-signin" disabled><GoogleMark/><span>{providers===null?'로그인 확인 중…':'Google 로그인 준비 중'}</span></button>}
      <p className="auth-note">처음 로그인하면 열람자로 가입됩니다.<br/>작성자 권한은 관리자가 부여합니다.</p>
      <details className="password-login"><summary>기존 이메일 계정으로 로그인</summary><form onSubmit={submit}><label htmlFor="login-email">이메일</label><input id="login-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={pending}/><label htmlFor="login-password">비밀번호</label><input id="login-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={pending}/><button className="pill auth-submit" disabled={pending}>{pending?'로그인 중…':'로그인'}</button></form></details>
    </>}{error&&<p className="auth-error" role="alert">{error}</p>}
  </dialog>;
}
