import { useEffect, useRef, useState } from 'react';
export default function AuthDialog({open,onClose,user,setUser,checking,connectionError,refresh}) {
  const dialog=useRef(null),emailInput=useRef(null);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  useEffect(()=>{ if(open){setError('');setPassword('');if(!dialog.current.open)dialog.current.showModal();if(!user)emailInput.current?.focus();}else if(dialog.current.open)dialog.current.close(); },[open,user]);
  async function submit(event) {
    event.preventDefault();setPending(true);setError('');
    try {
      const response=await fetch(user?'/api/auth/logout':'/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(user?{}:{email,password})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'로그인 요청을 처리하지 못했습니다.');
      setPassword('');setUser(body.user);if(!user)onClose();
    }catch(error){setError(error instanceof Error?error.message:'연결을 확인한 후 다시 시도해 주세요.');}finally{setPending(false);}
  }
  return <dialog className="auth-dialog" ref={dialog} aria-labelledby="auth-title" onClose={()=>{setPassword('');onClose();}} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}>
    <button type="button" className="auth-close" aria-label="프로필 닫기" onClick={onClose}>×</button>
    <p className="auth-brand">21st ARK</p><h2 id="auth-title">{user?'내 프로필':'로그인'}</h2>
    {checking?<p className="auth-description" role="status">로그인 상태를 확인하고 있어요.</p>:connectionError?<><p className="auth-error" role="alert">로그인 서비스에 연결하지 못했습니다.</p><button className="pill" onClick={refresh}>다시 확인</button></>:user?<form onSubmit={submit}><div className="account-avatar">{user.name[0]}</div><strong className="account-name">{user.name}</strong><p className="account-email">{user.email}</p><span className="account-role">{user.role==='admin'?'관리자':'필자'}</span>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="pill auth-submit" disabled={pending}>{pending?'로그아웃 중…':'로그아웃'}</button></form>:<>
      <p className="auth-description">필자 계정으로 로그인해 주세요.</p>
      <form onSubmit={submit}>
        <label htmlFor="login-email">이메일</label><input ref={emailInput} id="login-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={pending}/>
        <label htmlFor="login-password">비밀번호</label><input id="login-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={pending}/>
        {error&&<p className="auth-error" role="alert">{error}</p>}
        <button className="pill primary auth-submit" disabled={pending}>{pending?'로그인 중…':'로그인'}</button>
      </form><p className="auth-note">계정이 필요하면 블로그 관리자에게 문의해 주세요.</p>
    </>}
  </dialog>;
}
