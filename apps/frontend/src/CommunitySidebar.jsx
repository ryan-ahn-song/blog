import { useEffect, useState } from 'react';
import { api } from './api';
import { Avatar } from './ContentViews';

export default function CommunitySidebar({user,refreshKey,onLogin}){
  const [trending,setTrending]=useState({topics:[],loading:true,error:''}),[subscriptions,setSubscriptions]=useState({key:'',writers:[],loading:true,error:''}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setTrending(previous=>({...previous,loading:true,error:''}));
    api('/api/trending',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setTrending({topics:result.topics,loading:false,error:''});}).catch(e=>{if(!controller.signal.aborted)setTrending({topics:[],loading:false,error:e.message});});
    return()=>controller.abort();
  },[refreshKey,retry]);
  useEffect(()=>{
    if(!user){setSubscriptions({key:'',writers:[],loading:false,error:''});return;}
    const controller=new AbortController();setSubscriptions({key:user.id,writers:[],loading:true,error:''});
    api('/api/subscriptions',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setSubscriptions({key:user.id,writers:result.writers,loading:false,error:''});}).catch(e=>{if(!controller.signal.aborted)setSubscriptions({key:user.id,writers:[],loading:false,error:e.message});});
    return()=>controller.abort();
  },[user?.id,refreshKey,retry]);
  const updates=subscriptions.key===user?.id?subscriptions:{writers:[],loading:true,error:''};
  return <aside className="right-column community-sidebar">
    <section className="topics"><div className="aside-heading"><h2>트랜딩</h2><span className="aside-period">최근 7일</span></div><div className="topic-list">
      {trending.loading?<p className="aside-empty" role="status">불러오는 중…</p>:trending.error?<p className="aside-empty" role="alert">트랜딩을 불러오지 못했습니다. <button className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:trending.topics.length?trending.topics.map(topic=><button className="pill" key={topic.id} data-explore-topic={topic.id}>{topic.name}<span className="topic-count">{topic.post_count}</span></button>):<p className="aside-empty">최근 7일간 업로드된 글이 없어요.</p>}
    </div></section>
    <section className="subscription-updates"><div className="aside-heading"><h2>내가 구독한 필자</h2></div>
      {!user?<div className="aside-empty"><p>구독한 필자의 새 글을 모아보세요.</p><button className="pill" onClick={onLogin}>로그인</button></div>:updates.loading?<p className="aside-empty" role="status">구독한 필자를 불러오는 중…</p>:updates.error?<p className="aside-empty" role="alert">구독한 필자를 불러오지 못했습니다. <button className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:updates.writers.length?<div className="subscription-list">{updates.writers.slice(0,6).map(writer=><div className="subscription-update" key={writer.id}>
        <button className="update-avatar" data-author={writer.id} data-author-name={writer.name} aria-label={writer.name+'의 프로필'}><Avatar writer={writer}/></button><div><button className="update-writer" data-author={writer.id} data-author-name={writer.name}>{writer.name}</button>{writer.latest_post?<><button className="update-post" data-post={writer.latest_post.id}>{writer.latest_post.title}</button><time dateTime={new Date(writer.latest_post.published_at*1000).toISOString()}>{new Date(writer.latest_post.published_at*1000).toLocaleDateString('ko-KR',{month:'short',day:'numeric',timeZone:'Asia/Seoul'})}</time></>:<p className="update-waiting">새 글을 기다리고 있어요.</p>}</div>
      </div>)}</div>:<div className="aside-empty"><button className="subscription-discover-link" data-view="writers">아직 구독한 필자가 없어요. 한번 찾아볼까요?</button></div>}
    </section>
  </aside>;
}
