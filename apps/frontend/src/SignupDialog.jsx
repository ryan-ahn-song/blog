import { useEffect, useRef, useState } from 'react';
import { api, jsonRequest } from './api';

function Notice({document}) {
  return <details className="legal-notice"><summary>{document.title} 전문 보기</summary><div>{document.sections.map(section=><section key={section.title}><h4>{section.title}</h4><p>{section.body}</p></section>)}</div></details>;
}
export function LegalDocuments(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError('');api('/api/auth/legal',{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[retry]);
  return error?<p className="auth-error" role="alert">{error} <button className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:data?<><p className="legal-review">{data.review_notice}</p>{Object.entries(data.documents).map(([key,document])=><Notice key={key} document={document}/>)}<p className="legal-contact">문의 <a href={'mailto:'+data.contact}>{data.contact}</a><br/>문서 버전 {data.version}</p></>:<p role="status">약관을 불러오고 있어요.</p>;
}
export default function SignupDialog({signup,onComplete,onCancel}){
  const dialog=useRef(null),[name,setName]=useState(signup.name??''),[terms,setTerms]=useState(false),[privacy,setPrivacy]=useState(false),[legal,setLegal]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{const controller=new AbortController();setError('');api('/api/auth/legal',{signal:controller.signal}).then(setLegal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[retry]);
  async function submit(event){event.preventDefault();if(busy||!legal)return;setBusy(true);setError('');try{const result=await api('/api/auth/signup',jsonRequest('POST',{name,terms,privacy,version:legal.version}));onComplete(result.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function cancel(){if(busy)return;setBusy(true);setError('');try{await api('/api/auth/signup',jsonRequest('DELETE',{}));onCancel();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <dialog ref={dialog} className="auth-dialog signup-dialog" aria-labelledby="signup-title" onCancel={event=>{event.preventDefault();cancel();}}>
    <button className="auth-close" aria-label="가입 취소" disabled={busy} onClick={cancel}>×</button><p className="auth-brand">21st ARK · JOIN</p><h2 id="signup-title">어떤 이름으로 만날까요?</h2><p className="auth-description">{signup.provider==='github'?'GitHub':'Google'} 인증을 마쳤어요.<br/>표시 이름과 필수 동의를 확인하면 가입이 완료됩니다.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><label htmlFor="signup-name">표시 이름 <span>1–80자</span></label><input id="signup-name" name="name" autoComplete="nickname" maxLength={80} required value={name} onChange={event=>setName(event.target.value)}/><p className="signup-name-note">프로필과 댓글에 표시되며 나중에 변경할 수 있어요.</p>
      <div className="signup-consents"><h3>가입 전 확인해 주세요</h3>{legal?<><p className="legal-review">{legal.review_notice}</p><label className="consent-check"><input type="checkbox" required checked={terms} onChange={event=>setTerms(event.target.checked)}/><span><small>필수</small> 이용약관에 동의합니다.</span></label><Notice document={legal.documents.terms}/><label className="consent-check"><input type="checkbox" required checked={privacy} onChange={event=>setPrivacy(event.target.checked)}/><span><small>필수</small> 개인정보 수집·이용에 동의합니다.</span></label><div className="consent-summary"><strong>계정 식별 · 로그인 · 회원 관리</strong><p>항목: 소셜 계정 식별자, 이메일, 표시 이름, 동의 버전·시각<br/>보유: 회원 탈퇴 시까지<br/>동의를 거부할 수 있으며, 거부하면 가입이 완료되지 않습니다.</p></div><Notice document={legal.documents.privacy}/><p className="legal-contact">개인정보 문의 <a href={'mailto:'+legal.contact}>{legal.contact}</a></p></>:<p role="status">약관을 불러오고 있어요. <button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 불러오기</button></p>}</div>
      {error&&<p className="auth-error" role="alert">{error}</p>}<button className="pill primary signup-submit" disabled={busy||!legal||!name.trim()||!terms||!privacy}>{busy?'처리 중…':'가입 완료'}</button><button type="button" className="text-button signup-cancel" disabled={busy} onClick={cancel}>지금은 둘러볼게요</button>
    </fieldset></form>
  </dialog>;
}
