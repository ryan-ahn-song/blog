import {useEffect,useRef} from 'react';

export default function PostDeleteConfirmation({post,pending,error,onCancel,onConfirm}){
  const dialog=useRef(null);
  useEffect(()=>{if(post&&!dialog.current.open)dialog.current.showModal();else if(!post&&dialog.current.open)dialog.current.close();},[post]);
  return <dialog ref={dialog} className="auth-dialog post-delete-dialog" aria-labelledby="post-delete-title" aria-describedby="post-delete-description" aria-busy={pending} onCancel={event=>{if(pending)event.preventDefault();else onCancel();}} onClose={()=>{if(!pending)onCancel();}}>
    <h2 id="post-delete-title">{post?.kind==='notice'?'공지':'포스트'}를 삭제할까요?</h2>
    <p className="post-delete-name">{post?.title}</p>
    <p id="post-delete-description">삭제한 포스트와 댓글, 조회·저장·좋아요 기록은 복구할 수 없습니다.</p>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <div className="post-delete-actions"><button type="button" className="pill" autoFocus disabled={pending} onClick={onCancel}>취소</button><button type="button" className="pill danger-fill" disabled={pending} onClick={onConfirm}>{pending?'삭제 중…':'삭제하기'}</button></div>
  </dialog>;
}
