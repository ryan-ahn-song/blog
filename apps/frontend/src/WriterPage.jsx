import { useEffect, useRef, useState } from 'react';
import { api, jsonRequest } from './api';
import { Avatar } from './ContentViews';
import ProfileForm from './ProfileForm';
import {WriterTaxonomySidebar} from './WriterTaxonomy';

export default function WriterPage({id,user,version,taxonomyVersion,filters,onFilter,onTaxonomyChanged,onLoaded,onSaved,onShare,onLogin,onSubscriptionChange,children}) {
  const [writer,setWriter]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false);
  const dialog=useRef(null);
  const activeUser=useRef(user?.id);activeUser.current=user?.id;
  const [subscribing,setSubscribing]=useState(false),[subscriptionError,setSubscriptionError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setWriter(null);setError('');
    api('/api/writers/'+id,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setWriter(result.writer);onLoaded(result.writer);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[id,version,user?.id,retry,onLoaded]);
  useEffect(()=>{if(editing&&!dialog.current.open)dialog.current.showModal();else if(!editing&&dialog.current?.open)dialog.current.close();},[editing]);
  const own=user?.id===id;
  async function subscribe(){
    if(!user){onLogin();return;}
    const actorId=user.id;
    setSubscribing(true);setSubscriptionError('');
    try{const result=await api('/api/writers/'+id+'/subscription',jsonRequest('PUT',{active:!writer.subscribed}));if(activeUser.current!==actorId)return;setWriter(previous=>previous?{...previous,subscribed:result.subscribed}:previous);onSubscriptionChange();}
    catch(e){if(activeUser.current===actorId)setSubscriptionError(e.message);}finally{setSubscribing(false);}
  }
  if(error)return <div className="writer-page-message"><p className="auth-error" role="alert">{error}</p><button className="pill" onClick={()=>setRetry(n=>n+1)}>다시 시도</button><button className="pill" data-view="writers">필자 목록</button></div>;
  if(!writer)return <p className="writer-page-message" role="status">필자 프로필을 불러오고 있어요.</p>;
  return <article className="writer-page">
    <div className={'writer-cover '+(!writer.cover_url?'no-cover':'')}>{writer.cover_url&&<img src={writer.cover_url} alt={writer.name+'의 커버'} fetchPriority="high"/>}</div>
    <div className="writer-profile-body">
      <div className="writer-identity-row"><div className="writer-avatar"><Avatar writer={writer}/></div><div className="writer-profile-actions">
        {own?<button className="pill primary" onClick={()=>setEditing(true)}>프로필 수정</button>:<><button className="pill" onClick={()=>onShare(id)}>프로필 공유 ↗</button><button className={'pill '+(writer.subscribed?'':'primary')} aria-pressed={Boolean(writer.subscribed)} disabled={subscribing} onClick={subscribe}>{subscribing?'처리 중…':writer.subscribed?'구독 중':'구독하기'}</button></>}
      </div></div>
      {subscriptionError&&<p className="auth-error" role="alert">{subscriptionError}</p>}
      <div className="writer-about"><div><h2>{writer.name}</h2>{writer.bio&&<p>{writer.bio}</p>}</div><dl className="writer-stats"><div><dt>업로드한 글</dt><dd>{writer.post_count.toLocaleString()}</dd></div><div><dt>총 조회수</dt><dd>{(writer.total_views??0).toLocaleString()}</dd></div></dl></div>
      <nav className="writer-tabs" aria-label="필자 페이지"><button onClick={()=>document.getElementById('writer-posts')?.scrollIntoView({behavior:(document.documentElement.dataset.reduceMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches)?'instant':'smooth'})}>포스트 <span>{writer.post_count}</span></button></nav>
      <div className="writer-post-layout"><section className="writer-posts" id="writer-posts" aria-labelledby="writer-posts-heading"><div className="writer-posts-heading"><h3 id="writer-posts-heading">{filters.category||filters.tag?'분류한 글':'최신 포스트'}</h3>{(filters.category||filters.tag)&&<button onClick={()=>onFilter('clear')}>필터 지우기 ×</button>}</div>{children}</section><WriterTaxonomySidebar writerId={id} user={user} total={writer.post_count} version={taxonomyVersion+':'+version} filters={filters} onFilter={onFilter} onChanged={onTaxonomyChanged}/></div>
    </div>
    <dialog ref={dialog} className="auth-dialog writer-edit-dialog" aria-labelledby="writer-edit-title" onCancel={event=>{if(busy)event.preventDefault();else setEditing(false);}} onClose={()=>setEditing(false)}>
      <button className="auth-close" type="button" aria-label="프로필 수정 닫기" disabled={busy} onClick={()=>setEditing(false)}>×</button><h2 id="writer-edit-title">프로필 수정</h2>
      {own&&editing&&<ProfileForm expanded user={user} onBusy={setBusy} onSaved={account=>{setEditing(false);onSaved(account);}}/>}
    </dialog>
  </article>;
}
