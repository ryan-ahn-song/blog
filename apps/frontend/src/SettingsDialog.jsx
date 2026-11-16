import AccountControls from './AccountControls';
import { WriterApplicationForm } from './WriterApplications';
import { LegalDocuments } from './SignupDialog';
import { useEffect, useRef, useState } from 'react';
import { api,roleName } from './api';

const defaults={font:'15',width:'720',motion:false};
function loadPreferences(){try{const value=JSON.parse(localStorage.getItem('ark-reading-preferences'));return {font:['15','17','19'].includes(value?.font)?value.font:defaults.font,width:['600','720','900'].includes(value?.width)?value.width:defaults.width,motion:value?.motion===true};}catch{return defaults;}}

export default function SettingsDialog({section,onClose,user,onLogin,onRoleChanged,onDeleted}) {
  const [accountBusy,setAccountBusy]=useState(false);
  const dialog=useRef(null),[account,setAccount]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[preferences,setPreferences]=useState(loadPreferences),[copied,setCopied]=useState(false),[preferenceError,setPreferenceError]=useState('');
  useEffect(()=>{if(section&&!dialog.current.open)dialog.current.showModal();else if(!section&&dialog.current.open)dialog.current.close();setCopied(false);},[section]);
  useEffect(()=>{
    const root=document.documentElement;root.style.setProperty('--reader-font',preferences.font+'px');root.style.setProperty('--reader-width',preferences.width+'px');root.dataset.reduceMotion=preferences.motion?'true':'false';
  },[preferences]);
  useEffect(()=>{
    if(section!=='account'||!user)return;
    const controller=new AbortController();setAccount(null);setError('');
    api('/api/auth/account',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setAccount(result);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[section,user?.id,retry]);
  function updatePreference(key,value){const next={...preferences,[key]:value};setPreferences(next);try{localStorage.setItem('ark-reading-preferences',JSON.stringify(next));setPreferenceError('');}catch{setPreferenceError('설정을 이 브라우저에 저장하지 못했어요.');}}
  const current=account?.user.id===user?.id?account:null;
  const titles={account:'계정 및 설정',display:'화면 설정',help:'도움말 및 피드백',legal:'약관 및 개인정보처리방침',apply:'작성자 신청하기'};
  async function copyFeedback(){try{await navigator.clipboard.writeText('21st ARK 피드백\n페이지: '+location.origin+location.pathname+location.hash+'\n\n어떤 문제가 있었나요?\n\n기대한 동작:\n\n재현 순서:\n');setCopied(true);}catch{setError('내용을 복사하지 못했어요. 문제가 발생한 화면과 재현 순서를 적어 주세요.');}}
  return <dialog ref={dialog} className="auth-dialog settings-dialog" aria-labelledby="settings-title" onCancel={event=>{if(accountBusy)event.preventDefault();else onClose();}} onClose={onClose}>
    <button className="auth-close" aria-label="설정 닫기" disabled={accountBusy} onClick={onClose}>×</button><h2 id="settings-title">{titles[section]??'설정'}</h2>
    {section==='account'&&(user?<>
      {error?<p className="auth-error" role="alert">{error} <button className="text-button" onClick={()=>setRetry(value=>value+1)}>다시 시도</button></p>:!current?<p role="status" className="settings-note">계정 정보를 불러오고 있어요.</p>:<>
        <dl className="settings-account"><div><dt>이름</dt><dd>{current.user.name}</dd></div><div><dt>로그인 이메일</dt><dd>{current.user.email}</dd></div><div><dt>권한</dt><dd>{roleName(current.user.role)}</dd></div></dl>
        <AccountControls key={current.user.id} account={current} onUpdated={setAccount} onDeleted={onDeleted} onBusy={setAccountBusy}/>
      </>}
    </>:<><p className="settings-note">로그인하면 계정 정보를 확인할 수 있어요.</p><button className="pill" onClick={()=>{onClose();onLogin();}}>로그인</button></>)}
    {section==='display'&&<>
      <p className="settings-note">읽기 화면에 바로 적용되며, 이 브라우저에 저장됩니다.</p>
      <label className="settings-field" htmlFor="reading-font">본문 글자 크기<select id="reading-font" value={preferences.font} onChange={event=>updatePreference('font',event.target.value)}><option value="15">기본 · 15px</option><option value="17">크게 · 17px</option><option value="19">더 크게 · 19px</option></select></label>
      <label className="settings-field" htmlFor="reading-width">읽기 화면 너비<select id="reading-width" value={preferences.width} onChange={event=>updatePreference('width',event.target.value)}><option value="600">좁게</option><option value="720">기본</option><option value="900">넓게</option></select></label>
      <label className="settings-toggle"><span>움직임 줄이기<small>전환 효과와 부드러운 스크롤을 줄입니다.</small></span><input type="checkbox" checked={preferences.motion} onChange={event=>updatePreference('motion',event.target.checked)}/></label>
      <div className="reading-sample" style={{fontSize:preferences.font+'px'}}>포스트가 편안하게 읽히는 크기를 선택해 보세요.</div><p className="settings-note">현재 21st ARK는 다크 테마로 제공됩니다.</p>{preferenceError&&<p className="auth-error" role="alert">{preferenceError}</p>}
    </>}
    {section==='apply'&&user&&<WriterApplicationForm user={user} onRoleChanged={onRoleChanged}/>}
    {section==='legal'&&<LegalDocuments/>}
    {section==='help'&&<>
      <section className="settings-section"><h3>자주 묻는 질문</h3><details><summary>포스트를 쓰려면 어떻게 하나요?</summary><p>로그인 후 작성자 권한이 있으면 왼쪽 연필 아이콘이나 상단의 ‘포스트 작성’을 이용할 수 있어요. 열람자는 더 보기 메뉴의 ‘작성자 신청하기’에서 신청할 수 있어요.</p></details><details><summary>초안과 업로드한 포스트는 어디에 있나요?</summary><p>‘내 포스트 관리’에서 확인할 수 있어요. 임시저장한 초안은 작성자에게만 보이고, 업로드한 포스트는 모든 사람이 읽을 수 있어요.</p></details><details><summary>저장한 포스트와 구독은 어떻게 이용하나요?</summary><p>로그인 후 포스트의 북마크 아이콘을 누르면 ‘저장한 포스트’에 보관됩니다. 필자 프로필에서 구독하면 홈의 ‘내가 구독한 필자’에 새 포스트가 표시됩니다.</p></details></section>
      <section className="settings-section"><h3>오류 신고와 의견</h3><p className="settings-note">문제가 발생한 화면과 재현 순서를 적어 주시면 도움이 됩니다. 아래에서 양식을 복사하고 GitHub 이슈로 전달할 수 있어요.</p><div className="settings-feedback"><button className="pill" onClick={copyFeedback}>{copied?'복사했어요':'피드백 양식 복사'}</button><a className="pill" href="https://github.com/ryan-ahn-song/blog/issues" target="_blank" rel="noopener noreferrer">GitHub 피드백 ↗</a></div>{error&&<p className="auth-error" role="alert">{error}</p>}</section>
    </>}
  </dialog>;
}
