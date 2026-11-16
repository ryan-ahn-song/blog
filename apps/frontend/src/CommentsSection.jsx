import {useEffect,useRef,useState} from 'react';
import {api,jsonRequest} from './api';
import {Avatar} from './ContentViews';

const timestamp=value=>new Date(value*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export default function CommentsSection({post,user,onLogin}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[text,setText]=useState(''),[editing,setEditing]=useState(null),[busy,setBusy]=useState(null),[notice,setNotice]=useState(''),[loginNeeded,setLoginNeeded]=useState(false);
  const requests=useRef(0),controller=useRef(null),mounted=useRef(true),currentActor=useRef(user?.id);currentActor.current=user?.id;
  const confirmation=useRef(null),[confirmComment,setConfirmComment]=useState(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;requests.current++;controller.current?.abort();};},[]);
  useEffect(()=>{setData(null);setEditing(null);setConfirmComment(null);setError('');setNotice('');setLoginNeeded(false);load(true);return()=>{requests.current++;controller.current?.abort();};},[post.id,user?.id,user?.role]);
  useEffect(()=>{if(confirmComment&&!confirmation.current.open)confirmation.current.showModal();else if(!confirmComment&&confirmation.current.open)confirmation.current.close();},[confirmComment]);
  async function load(reset){
    const request=++requests.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);setLoadError('');
    const cursor=reset?null:data?.next_cursor;
    try{const result=await api('/api/posts/'+post.id+'/comments'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal:abort.signal});if(mounted.current&&request===requests.current)setData(previous=>reset?result:{...result,comments:[...new Map([...(previous?.comments??[]),...result.comments].map(comment=>[comment.id,comment])).values()]});}
    catch(e){if(mounted.current&&request===requests.current&&!abort.signal.aborted)setLoadError(e.message);}
    finally{if(mounted.current&&request===requests.current)setLoading(false);}
  }
  async function submit(event){
    event.preventDefault();if(busy||!text.trim()||!user)return;
    const actor=user.id;setBusy('create');setError('');setNotice('');
    try{await api('/api/posts/'+post.id+'/comments',jsonRequest('POST',{body:text}));if(!mounted.current||currentActor.current!==actor)return;setText('');setNotice('댓글을 등록했습니다.');await load(true);}
    catch(e){if(mounted.current&&currentActor.current===actor){setError(e.message);if(e.status===401)setLoginNeeded(true);}}
    finally{if(mounted.current)setBusy(null);}
  }
  async function save(comment){
    if(busy||!editing?.body.trim())return;const actor=user?.id;setBusy(comment.id);setError('');setNotice('');
    try{await api('/api/posts/'+post.id+'/comments/'+comment.id,jsonRequest('PATCH',{body:editing.body,revision:editing.revision}));if(!mounted.current||currentActor.current!==actor)return;setEditing(null);setNotice('댓글을 수정했습니다.');await load(true);}
    catch(e){if(mounted.current&&currentActor.current===actor){setError(e.message);if(e.status===401)setLoginNeeded(true);}}
    finally{if(mounted.current)setBusy(null);}
  }
  async function remove(comment){
    if(busy)return;
    const actor=user?.id;setBusy(comment.id);setError('');setNotice('');
    try{await api('/api/posts/'+post.id+'/comments/'+comment.id,jsonRequest('DELETE',{revision:comment.revision}));if(!mounted.current||currentActor.current!==actor)return;setConfirmComment(null);if(editing?.id===comment.id)setEditing(null);setNotice('댓글을 삭제했습니다.');await load(true);}
    catch(e){if(mounted.current&&currentActor.current===actor){setError(e.message);if(e.status===401)setLoginNeeded(true);}}
    finally{if(mounted.current)setBusy(null);}
  }
  return <section className="post-comments" id="post-comments" aria-labelledby="comments-title">
    <div className="comments-heading"><h3 id="comments-title">댓글 <span>{data?.total??'—'}</span></h3><button className="comments-refresh" aria-label="댓글 새로고침" title="댓글 새로고침" disabled={loading||Boolean(busy)} onClick={()=>load(true)}>↻</button></div>
    {user?<form className="comment-composer" onSubmit={submit}><div className="comment-composer-user"><Avatar writer={user}/><strong>{user.name}</strong></div><label className="sr-only" htmlFor={'comment-body-'+post.id}>댓글 내용</label><textarea id={'comment-body-'+post.id} rows={3} maxLength={3000} placeholder="댓글을 남겨보세요." value={text} disabled={Boolean(busy)} onChange={event=>setText(event.target.value)}/><div className="comment-form-actions"><span>{text.length.toLocaleString()} / 3,000</span><button className="pill primary" disabled={Boolean(busy)||!text.trim()}>{busy==='create'?'등록 중…':'댓글 등록'}</button></div></form>:<button className="comment-login" onClick={onLogin}>로그인하고 댓글 남기기 <span aria-hidden="true">↗</span></button>}
    {error&&<p className="comment-error" role="alert">{error}{(!user||loginNeeded)&&<button onClick={onLogin}>로그인</button>}</p>}{notice&&<p className="comment-notice" role="status">{notice}</p>}
    {loadError&&<p className="comment-error" role="alert">{loadError} <button disabled={Boolean(busy)||loading} onClick={()=>load(true)}>다시 시도</button></p>}
    {!data&&loading&&<p className="comments-empty" role="status">댓글을 불러오고 있어요.</p>}
    {data&&!data.comments.length&&<p className="comments-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>}
    <div className="comment-list">{data?.comments.map(comment=><article className="comment-item" key={comment.id}><div className="comment-header"><button className="comment-writer" data-author={comment.writer.id} data-author-name={comment.writer.name}><Avatar writer={comment.writer}/><span><strong>{comment.writer.name}{comment.writer.id===post.writer.id&&<small className="comment-author-badge">작성자</small>}</strong><time dateTime={new Date(comment.created_at*1000).toISOString()}>{timestamp(comment.created_at)}{comment.revision>1?' · 수정됨':''}</time></span></button><div className="comment-controls">{comment.can_edit&&user?.id===comment.writer.id&&<button aria-label={comment.writer.name+' 댓글 수정'} disabled={Boolean(busy)||loading} onClick={()=>{setEditing({id:comment.id,body:comment.body,revision:comment.revision});setError('');}}>수정</button>}{comment.can_delete&&user&&(user.id===comment.writer.id||user.role==='admin')&&<button className="comment-delete" aria-label={comment.writer.name+' 댓글 삭제'} disabled={Boolean(busy)||loading} onClick={()=>{setError('');setConfirmComment(comment);}}>삭제</button>}</div></div>
      {editing?.id===comment.id?<div className="comment-edit"><label className="sr-only" htmlFor={'edit-comment-'+comment.id}>댓글 수정 내용</label><textarea id={'edit-comment-'+comment.id} rows={3} maxLength={3000} value={editing.body} disabled={Boolean(busy)} onChange={event=>setEditing(previous=>({...previous,body:event.target.value}))}/><div className="comment-form-actions"><span>{editing.body.length.toLocaleString()} / 3,000</span><div><button className="pill" disabled={Boolean(busy)} onClick={()=>setEditing(null)}>취소</button><button className="pill primary" disabled={Boolean(busy)||!editing.body.trim()} onClick={()=>save(comment)}>{busy===comment.id?'저장 중…':'저장'}</button></div></div></div>:<p className="comment-body">{comment.body}</p>}
    </article>)}</div>
    {data?.next_cursor&&<button className="pill comments-more" disabled={loading||Boolean(busy)} onClick={()=>load(false)}>{loading?'불러오는 중…':'댓글 더 보기'}</button>}
    <dialog ref={confirmation} className="auth-dialog comment-delete-dialog" aria-labelledby="comment-delete-title" onCancel={event=>{if(busy)event.preventDefault();else setConfirmComment(null);}} onClose={()=>setConfirmComment(null)}><h3 id="comment-delete-title">댓글을 삭제할까요?</h3><p>삭제한 댓글은 복구할 수 없습니다.</p>{error&&<p className="comment-error" role="alert">{error}</p>}<div><button className="pill" aria-label="댓글 삭제 취소" disabled={Boolean(busy)} onClick={()=>setConfirmComment(null)}>취소</button><button className="pill primary" aria-label="댓글 삭제 확인" disabled={Boolean(busy)} onClick={()=>remove(confirmComment)}>{busy?'삭제 중…':'삭제'}</button></div></dialog>
  </section>;
}
