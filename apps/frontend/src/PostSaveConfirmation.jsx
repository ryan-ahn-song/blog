import { useEffect, useRef } from 'react';
export function saveConfirmation(status,record){
  if(status==='draft')return record?.status==='published'?{title:'업로드를 취소하고 임시저장할까요?',description:'공개 목록에서 제외하고 본인만 볼 수 있는 초안으로 저장합니다.',action:'업로드 취소 · 임시저장'}:{title:'포스트를 임시저장할까요?',description:'본인만 볼 수 있는 초안으로 저장하고 저장된 포스트로 이동합니다.',action:'임시저장'};
  return record?.status==='published'?{title:'수정 사항을 업로드할까요?',description:'수정한 내용이 공개 포스트에 반영됩니다.',action:'수정 사항 업로드'}:{title:'포스트를 업로드할까요?',description:'모든 사람이 읽을 수 있는 공개 포스트로 업로드합니다.',action:'업로드'};
}
export default function PostSaveConfirmation({intent,pending,error,onCancel,onConfirm}){
  const dialog=useRef(null);
  useEffect(()=>{if(intent&&!dialog.current.open)dialog.current.showModal();else if(!intent&&dialog.current.open)dialog.current.close();},[intent]);
  return <dialog className="auth-dialog post-save-dialog" ref={dialog} aria-labelledby="post-save-title" onCancel={event=>{if(pending)event.preventDefault();else onCancel();}} onClose={onCancel}>
    <h2 id="post-save-title">{intent?.confirmation.title}</h2><p className="post-save-name">{intent?.value.title}</p><p className="auth-description">{intent?.confirmation.description}</p>{error&&<p className="auth-error" role="alert">{error}</p>}<div className="post-save-dialog-actions"><button type="button" className="pill" disabled={pending} onClick={onCancel}>취소</button><button type="button" className="pill primary" disabled={pending} onClick={onConfirm}>{pending?'저장 중…':intent?.confirmation.action}</button></div>
  </dialog>;
}
