import PostPinButton from './PostPinButton';
import LoadingSkeleton from './LoadingSkeleton';
import { useEffect, useRef, useState } from 'react';
import { api, jsonRequest, clearApiCache } from './api';
import PostDeleteConfirmation from './PostDeleteConfirmation';
import './my-posts.css';
const number=value=>(value??0).toLocaleString('ko-KR');
const shortDate=value=>value.slice(5).replace('-','.');
const date=value=>new Date(value*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
function Sparkline({values,title}){
  const ceiling=Math.max(1,...values),points=values.map((value,index)=>`${index*118/Math.max(1,values.length-1)+1},${32-value/ceiling*27}`).join(' ');
  return <svg className="post-sparkline" viewBox="0 0 120 36" role="img" aria-label={title+' 최근 14일 독자 추이'}><title>{values.map(number).join(', ')}</title><path className="spark-baseline" d="M1 32H119"/><polyline points={points}/></svg>;
}
function VisitorChart({series}){
  const [selected,setSelected]=useState(null),max=Math.max(4,Math.ceil(Math.max(0,...series.map(point=>point.readers))/4)*4);
  const canvas=useRef(null),[canvasWidth,setCanvasWidth]=useState(800);
  useEffect(()=>setSelected(null),[series.length]);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setCanvasWidth(Math.max(260,entries[0].contentRect.width)));if(canvas.current)observer.observe(canvas.current);return()=>observer.disconnect();},[]);
  const left=30,right=canvasWidth-10,top=12,bottom=139,width=right-left,height=bottom-top;
  const points=series.map((point,index)=>({x:left+index*width/Math.max(1,series.length-1),y:bottom-point.readers/max*height,...point}));
  const active=points[Math.min(selected??points.length-1,points.length-1)],line=points.map(point=>`${point.x},${point.y}`).join(' '),empty=series.every(point=>point.readers===0);
  const ticks=[0,Math.floor((series.length-1)/3),Math.floor((series.length-1)*2/3),series.length-1];
  function move(event){const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*canvasWidth;setSelected(Math.max(0,Math.min(points.length-1,Math.round((x-left)/width*(points.length-1)))));}
  return <div className="visitor-chart" tabIndex={0} role="group" aria-label="일별 독자 그래프. 왼쪽과 오른쪽 방향키로 날짜를 확인할 수 있습니다." onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')setSelected(null);else setSelected(index=>Math.max(0,Math.min(points.length-1,(index??points.length-1)+(event.key==='ArrowLeft'?-1:1))));}}>
    <div className="chart-detail" aria-live="polite"><span>{active?.date.replaceAll('-','. ')}</span><strong>{number(active?.readers)}<small>명</small></strong><span>조회 {number(active?.views)}회</span></div>
    <svg ref={canvas} viewBox={'0 0 '+canvasWidth+' 165'} role="img" aria-label={'최근 '+series.length+'일간 일별 독자 수'} onPointerMove={move} onPointerLeave={()=>setSelected(null)}>
      {[0,1,2].map(index=><g key={index}><line className="chart-grid" x1={left} x2={right} y1={bottom-index*height/2} y2={bottom-index*height/2}/><text className="chart-axis" x={left-12} y={bottom-index*height/2+3} textAnchor="end">{number(index*max/2)}</text></g>)}
      {ticks.map((index,i)=><text className="chart-axis" key={i} x={points[index]?.x??left} y={160} textAnchor={i===0?'start':i===3?'end':'middle'}>{shortDate(series[index].date)}</text>)}
      <polygon className="chart-area" points={`${left},${bottom} ${line} ${right},${bottom}`}/><polyline className="chart-line" points={line}/>
      {selected!==null&&active&&<><line className="chart-cursor" x1={active.x} x2={active.x} y1={top} y2={bottom}/><circle className="chart-dot" cx={active.x} cy={active.y} r="3.5"/></>}
    </svg>
    {empty&&<div className="chart-empty">아직 방문 기록이 없어요.<span>업로드된 포스트에 독자가 방문하면 추이가 표시됩니다.</span></div>}
    <table className="sr-only"><caption>일별 독자와 조회 수</caption><thead><tr><th>날짜</th><th>독자</th><th>조회</th></tr></thead><tbody>{series.map(point=><tr key={point.date}><td>{point.date}</td><td>{point.readers}</td><td>{point.views}</td></tr>)}</tbody></table>
  </div>;
}
export default function MyPosts({user,onEdit,refreshKey,onChanged}){
  const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[page,setPage]=useState(0),[days,setDays]=useState(28),[status,setStatus]=useState('all'),[query,setQuery]=useState(''),[sort,setSort]=useState('updated'),[retry,setRetry]=useState(0),[opening,setOpening]=useState(null);
  const requestKey=JSON.stringify([user.id,page,days,status,query.trim(),sort,refreshKey,retry]);
  const [deleting,setDeleting]=useState(null),activeUser=useRef(user.id);activeUser.current=user.id;
  const [deleteTarget,setDeleteTarget]=useState(null),[deleteError,setDeleteError]=useState('');
  useEffect(()=>{setDeleteTarget(null);setDeleteError('');},[user.id]);
  useEffect(()=>{
    const controller=new AbortController();let active=true,inFlight=false;setLoading(true);setError('');
    async function load(){
      if(inFlight)return;inFlight=true;setLoading(true);
      try{const response=await api('/api/author/dashboard?'+new URLSearchParams({days:String(days),page:String(page),status,q:query.trim(),sort}),{signal:controller.signal});if(active){setResult({...response,requestKey});setError('');}}
      catch(e){if(active&&!controller.signal.aborted)setError(e.message);}finally{inFlight=false;if(active)setLoading(false);}
    }
    const timer=setTimeout(load,query.trim()?250:0);
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[user.id,page,days,status,query,sort,refreshKey,retry]);
  async function edit(post){
    if(opening)return;setOpening(post.id);
    try{const response=await api('/api/posts/'+post.id);onEdit(response.post);}catch(e){setError(e.message);}finally{setOpening(null);}
  }
  function remove(post){if(deleting||opening)return;setDeleteError('');setDeleteTarget(post);}
  function cancelDelete(){if(!deleting){setDeleteTarget(null);setDeleteError('');}}
  async function confirmDelete(){
    const post=deleteTarget;if(!post||deleting||opening)return;
    const actor=user.id;setDeleting(post.id);setDeleteError('');setError('');
    try{
      await api('/api/posts/'+post.id,jsonRequest('DELETE',{revision:post.revision}));
      if(activeUser.current!==actor)return;
      try{localStorage.removeItem('ark-draft:'+actor+':'+post.id);}catch{}
      setDeleteTarget(null);
      if(page>0&&current?.posts.length===1)setPage(value=>value-1);else setRetry(value=>value+1);
      onChanged?.();
    }catch(e){if(activeUser.current===actor)setDeleteError(e.message);}finally{setDeleting(null);}
  }
  const current=result?.owner_id===user.id&&result.requestKey===requestKey?result:null,summary=current?.summary;
  const metrics=[{label:'독자 수',value:summary?.readers,unit:'명',detail:'최근 '+days+'일'},{label:'조회 수',value:summary?.views,unit:'회',detail:'최근 '+days+'일'},{label:'저장 수',value:summary?.bookmarks,unit:'건',detail:''},{label:'좋아요',value:summary?.likes,unit:'개',detail:''}];
  return <section className="author-dashboard" aria-label="내 포스트와 독자 통계">
    <div className="dashboard-intro"><div><h2>내 포스트와 독자</h2><p>초안과 업로드한 포스트, 독자의 반응을 한곳에서 확인하세요.</p></div><div className="dashboard-refresh"><button className="refresh-button" aria-label="통계 새로고침" disabled={loading} onClick={()=>{clearApiCache();setRetry(n=>n+1);}}>↻</button></div></div>
    {error&&<p className="auth-error dashboard-error" role="alert">{error} <button className="text-button" onClick={()=>{clearApiCache();setRetry(n=>n+1);}}>다시 시도</button></p>}
    <div className="dashboard-metrics">{metrics.map(metric=><div className="dashboard-metric" key={metric.label}><p>{metric.label}</p><strong>{summary?number(metric.value):<span className="sk-block sk-number"/>}<small>{metric.unit}</small></strong>{metric.detail&&<span>{metric.detail}</span>}</div>)}</div>
    <section className="dashboard-chart-panel" aria-labelledby="visitors-title"><div className="chart-heading"><div><h3 id="visitors-title">방문자 추이</h3><p>내 포스트를 방문한 일별 독자 수</p></div><div className="period-control" role="group" aria-label="통계 기간">{[7,28,90].map(value=><button key={value} aria-pressed={days===value} onClick={()=>{setDays(value);setPage(0);}}>{value}일</button>)}</div></div>{current?<VisitorChart series={current.series}/>:<>{error?<p className="dashboard-loading">독자 통계를 불러오지 못했어요.</p>:<LoadingSkeleton variant="chart" label="독자 통계를 불러오고 있어요."/>}</>}<div className="chart-footnote"><span><i/>독자</span><span>{current?new Date(current.generated_at*1000).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Seoul'})+' 갱신':''}</span></div></section>
    <section className="dashboard-posts" aria-label="내 포스트 목록"><div className="posts-toolbar"><div className="post-status-tabs" role="group" aria-label="포스트 상태">{[['all','전체',summary?.total],['published','업로드됨',summary?.published],['draft','초안',summary?.drafts]].map(([value,label,count])=><button key={value} aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(0);}}>{label}<span>{count??'—'}</span></button>)}</div><div className="post-filters"><label className="sr-only" htmlFor="my-post-search">내 포스트 제목 검색</label><input id="my-post-search" type="search" maxLength={100} placeholder="제목으로 찾기" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/><label className="sr-only" htmlFor="my-post-sort">내 포스트 정렬</label><select id="my-post-sort" value={sort} onChange={event=>{setSort(event.target.value);setPage(0);}}><option value="updated">최근 수정순</option><option value="readers">독자 많은 순</option><option value="bookmarks">저장 많은 순</option></select></div></div>
      {!current?<>{error?<p className="dashboard-loading">포스트 목록을 불러오지 못했어요.</p>:<LoadingSkeleton variant="rows" label="포스트 목록을 불러오고 있어요."/>}</>:!current.posts.length?<div className="dashboard-posts-empty"><strong>{query.trim()?'검색한 포스트가 없어요.':status==='draft'?'저장한 초안이 없어요.':status==='published'?'업로드된 포스트가 없어요.':'아직 작성한 포스트가 없어요.'}</strong><p>{query.trim()?'다른 제목으로 검색해 보세요.':'상단의 포스트 작성에서 첫 포스트를 시작해 보세요.'}</p></div>:<div className="managed-post-list">{current.posts.map(post=><article className="managed-post" key={post.id}><div className="managed-post-main"><div className="managed-post-title"><button onClick={()=>edit(post)} disabled={Boolean(opening||deleting)}>{post.title}</button>{Boolean(post.pinned)&&<span className="post-pin-badge">고정</span>}{post.kind==='notice'&&<span className="post-kind-badge">공지</span>}<span className={'post-state '+post.status}>{post.status==='published'?'업로드됨':'초안'}</span></div>{post.summary&&<p>{post.summary}</p>}<div className="managed-post-meta"><span>{post.category==='tech'?'개발 · 기술':'일상 · 에세이'}</span><span>{date(post.updated_at)} 수정</span><button onClick={()=>edit(post)} disabled={Boolean(opening||deleting)}>{opening===post.id?'불러오는 중…':post.status==='draft'?'이어서 쓰기':'수정'}</button>{post.status==='published'&&<button data-post={post.id}>포스트 보기 ↗</button>}<PostPinButton post={post} user={user} onChanged={()=>{setRetry(value=>value+1);onChanged?.();}}/><button className="delete-post-button" aria-label={post.title+' 삭제'} disabled={Boolean(opening||deleting)} onClick={()=>remove(post)}>{deleting===post.id?'삭제 중…':'삭제'}</button></div></div><div className="managed-post-insights"><div className="post-stat"><span>독자</span><strong>{number(post.reader_count)}<small>명</small></strong></div><div className="post-stat"><span>저장</span><strong>{number(post.bookmark_count)}<small>명</small></strong></div><div className="post-stat"><span>좋아요</span><strong>{number(post.like_count)}</strong></div><div className="post-trend"><Sparkline values={post.daily_readers} title={post.title}/><span>최근 14일</span></div></div></article>)}</div>}
      {current&&current.total>20&&<div className="pagination"><button className="pill" disabled={!page||loading} onClick={()=>setPage(value=>value-1)}>이전</button><span>{page+1} / {Math.ceil(current.total/20)} · {number(current.total)}개의 포스트</span><button className="pill" disabled={(page+1)*20>=current.total||loading} onClick={()=>setPage(value=>value+1)}>다음</button></div>}
    </section>
    <PostDeleteConfirmation post={deleteTarget} pending={Boolean(deleting)} error={deleteError} onCancel={cancelDelete} onConfirm={confirmDelete}/>
  </section>;
}
