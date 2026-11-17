import { useEffect, useState } from 'react';
import { api } from './api';
import { Avatar } from './ContentViews';
import {shortName} from './display-name';

export function TrendingPostCards({posts,ranked=true}){return (ranked?posts.slice(0,3):posts).map((post,index)=><button className="trending-post-card" key={post.id} data-post={post.id} aria-label={post.title+' 읽기'}>{ranked&&<span className="trending-post-rank">{String(index+1).padStart(2,'0')}</span>}<span className="trending-post-copy"><strong>{post.title}</strong>{post.summary&&<p>{post.summary}</p>}</span><span className="trending-post-arrow" aria-hidden="true">↗</span></button>);}

export default function CommunitySidebar({authChecking,view,user,refreshKey,onLogin}){
  const recent=view==='saved',listKey=recent?'recent:'+(user?.id??'anonymous'):'trending';
  const [listing,setListing]=useState({key:'',posts:[],loading:true,error:''}),[subscriptions,setSubscriptions]=useState({key:'',writers:[],loading:true,error:''}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    if(recent&&!user){setListing({key:listKey,posts:[],loading:false,error:''});return;}
    setListing({key:listKey,posts:[],loading:true,error:''});
    api(recent?'/api/reading-history':'/api/trending',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setListing({key:listKey,posts:result.posts,loading:false,error:''});}).catch(e=>{if(!controller.signal.aborted&&e.name!=='AbortError')setListing({key:listKey,posts:[],loading:false,error:e.message});});
    return()=>controller.abort();
  },[listKey,refreshKey,retry]);
  useEffect(()=>{
    if(!user){setSubscriptions({key:'',writers:[],loading:false,error:''});return;}
    const controller=new AbortController();setSubscriptions({key:user.id,writers:[],loading:true,error:''});
    api('/api/subscriptions',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setSubscriptions({key:user.id,writers:result.writers,loading:false,error:''});}).catch(e=>{if(!controller.signal.aborted)setSubscriptions({key:user.id,writers:[],loading:false,error:e.message});});
    return()=>controller.abort();
  },[user?.id,refreshKey,retry]);
  const updates=subscriptions.key===user?.id?subscriptions:{writers:[],loading:true,error:''};
  const cards=listing.key===listKey?listing:{posts:[],loading:true,error:''};
  return <aside className="right-column community-sidebar">
    <section className="trending-posts"><div className="aside-heading"><h2>{recent?'최근 읽은 포스트':'트랜딩'}</h2>{!recent&&<span className="aside-period">최근 7일 조회순</span>}</div><div className={'trending-post-list divided-post-list'+(recent?'':' ranked-post-list')}>
      {recent&&!user?(authChecking?<p className="aside-empty" role="status">로그인 상태를 확인하고 있어요.</p>:<p className="aside-empty">로그인하면 최근 읽은 포스트를 볼 수 있어요.</p>):cards.loading?<p className="aside-empty" role="status">불러오는 중…</p>:cards.error?<p className="aside-empty" role="alert">{recent?'최근 읽은 포스트를':'트랜딩을'} 불러오지 못했습니다. <button className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:cards.posts.length?<TrendingPostCards posts={cards.posts} ranked={!recent}/>:<p className="aside-empty">{recent?'아직 읽은 포스트가 없어요.':'최근 7일간 조회된 포스트가 없어요.'}</p>}
    </div></section>
    <section className="subscription-updates"><div className="aside-heading"><h2>내가 구독한 필자</h2></div>
      {!user?(authChecking?<p className="aside-empty" role="status">로그인 상태를 확인하고 있어요.</p>:<div className="aside-empty"><p>구독한 필자의 새 포스트를 모아보세요.</p><button className="pill" onClick={onLogin}>로그인</button></div>):updates.loading?<p className="aside-empty" role="status">구독한 필자를 불러오는 중…</p>:updates.error?<p className="aside-empty" role="alert">구독한 필자를 불러오지 못했습니다. <button className="text-button" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>:updates.writers.length?<div className="subscription-list">{updates.writers.slice(0,6).map(writer=><div className="subscription-update" key={writer.id}>
        <button className="update-avatar" data-author={writer.id} data-author-name={writer.name} aria-label={writer.name+'의 프로필'}><Avatar writer={writer}/></button><div><button className="update-writer" title={writer.name} data-author={writer.id} data-author-name={writer.name}>{shortName(writer.name)}</button>{writer.latest_post?<><button className="update-post" data-post={writer.latest_post.id}>{writer.latest_post.title}</button><time dateTime={new Date(writer.latest_post.published_at*1000).toISOString()}>{new Date(writer.latest_post.published_at*1000).toLocaleDateString('ko-KR',{month:'short',day:'numeric',timeZone:'Asia/Seoul'})}</time></>:<p className="update-waiting">새 포스트를 기다리고 있어요.</p>}</div>
      </div>)}</div>:<div className="aside-empty"><button className="subscription-discover-link" data-view="writers">아직 구독한 필자가 없어요. 한번 찾아볼까요?</button></div>}
    </section>
  </aside>;
}
