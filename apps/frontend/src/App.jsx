import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AppShell from './AppShell.jsx';
import { posts as samplePosts, writers as sampleWriters } from './data.js';
import { exploreTopics } from './topics.js';
import { assetUrl } from './assets.js';
import AuthDialog from './AuthDialog.jsx';
import Editor, { MyPosts } from './Editor.jsx';
import AdminPanel from './AdminPanel.jsx';
import { api } from './api';

const label = c => c === 'tech' ? '개발 · 기술' : '일상 · 에세이';
const paths = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  bookmark: 'M6 3h12v19l-6-4-6 4Z',
  share: 'M12 16V2m-5 5 5-5 5 5M5 12H3v10h18V12h-2',
  read: 'M3 3h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v17h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z M12 5v17',
};
function Icon({name}) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]}/></svg>; }
function Avatar({writer}) { return <span className="avatar" style={{background:writer.color}}>{writer.name[0]}</span>; }
function readStored(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } }

function Post({post:p,writer,first,liked,saved}) {
  return <article className="post">
    <header className="post-header"><Avatar writer={writer}/><button className="author-button" data-author={p.author} aria-label={`${writer.name}의 글 보기`}><strong>{writer.name}</strong><time dateTime={p.date.replaceAll('.','-')}>{p.date} · {p.read} 읽기</time></button><button className="post-category" data-category={p.category}>{label(p.category)}</button></header>
    <button className="post-title" data-post={p.id}><h2>{p.title}</h2></button><p className="post-summary">{p.summary}</p>
    <button className="post-visual" data-post={p.id} aria-label={`${p.title} 읽기`}>
      {p.image ? <img src={p.image} alt={p.alt} fetchPriority={first?'high':'auto'} loading={first?'eager':'lazy'}/> : p.art === 'essay' ? <div className="essay-art">서두르지 않고,<br/>좋아하는 만큼.</div> : <div className="code-art" aria-hidden="true"><small>{p.art === 'code' ? '// small pieces, better together' : '~/ 21st-ark / deploy'}</small>{p.art === 'code' ? <div><span>export</span>{' function buildTogether() {'}<br/>&nbsp; return ideas<br/>&nbsp;&nbsp; .map(share)<br/>&nbsp;&nbsp; .reduce(connect);<br/>{'}'}</div> : <div><span>➜</span> git push origin main<br/>✓ Build completed<br/>✓ All checks passed<br/><span>↗ Your next chapter is live.</span></div>}</div>}
      <span className="visual-overlay"><span>21st ARK · {label(p.category)}</span><span className="open-circle" aria-hidden="true">↗</span></span>
    </button>
    <div className="post-actions"><button className="action" data-like={p.id} aria-label={`${p.title} 좋아요`} aria-pressed={liked}><Icon name="heart"/><span>{liked?1:0}</span></button><button className="action" data-post={p.id} aria-label="글 읽기"><Icon name="read"/></button><button className="action" data-save={p.id} aria-label={`${p.title} 저장`} aria-pressed={saved}><Icon name="bookmark"/></button><button className="action" data-share={p.id} aria-label={`${p.title} 링크 복사`}><Icon name="share"/></button></div>
  </article>;
}

function Explore({query,topicId,posts,writers}) {
  const strip = useRef(null);
  const [edges,setEdges] = useState({start:true,end:true});
  const topic = exploreTopics.find(t=>t.id===topicId);
  const matching = posts.filter(p=>(topicId==='all'||topic?.postIds.includes(p.id)||p.category===(topicId==='essay'?'life':topicId)) && `${p.title} ${p.summary} ${p.body} ${writers[p.author].name} ${writers[p.author].role} ${label(p.category)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const people = writers.map((w,index)=>({...w,index})).filter(w=>matching.some(p=>p.author===w.index));
  const images = writers.map((_,i)=>assetUrl(['code.jpg','workspace.jpg','walk.jpg','code.jpg','coffee.jpg','walk.jpg'][i%6]));
  const update = () => { const el=strip.current; if(el) setEdges({start:el.scrollLeft<2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2}); };
  useLayoutEffect(()=>{ update(); const observer=new ResizeObserver(update); if(strip.current) observer.observe(strip.current); return ()=>observer.disconnect(); },[query,topicId]);
  const slide = direction => strip.current?.scrollBy({left:direction*strip.current.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  return <>
    <section className="explore-section"><div className="explore-heading"><h2>{query||topicId!=='all'?'이야기를 쓰는 필자':'함께 읽는 필자'} <span>›</span></h2><div className="carousel-controls"><button onClick={()=>slide(-1)} disabled={edges.start} aria-label="이전 필자">‹</button><button onClick={()=>slide(1)} disabled={edges.end} aria-label="다음 필자">›</button></div></div>
      <div className="creator-strip" ref={strip} onScroll={update}>{people.length ? people.map(w=><button className="creator-card" key={w.index} data-author={w.index}><span className="creator-picture" style={{'--creator-color':w.color}}><img src={images[w.index]} alt="" loading="lazy"/><span>{w.name[0]}</span></span><strong>{w.name}</strong><small>{w.role}</small></button>) : <p className="explore-empty">일치하는 필자가 없어요.</p>}</div>
    </section>
    {(query||topicId!=='all')&&<section className="explore-section"><div className="explore-heading"><h2>검색한 이야기 <small>{matching.length}</small></h2></div><div className="explore-results">{matching.length?matching.map(p=><button key={p.id} className="explore-result" data-post={p.id}><span className="result-category">{label(p.category)}</span><strong>{p.title}</strong><p>{p.summary}</p><small>{writers[p.author].name} · {p.date}</small></button>):<p className="explore-empty">일치하는 글이 없어요. 다른 검색어나 주제를 선택해 보세요.</p>}</div></section>}
    <section className="explore-section"><div className="explore-heading"><h2>주제 둘러보기</h2></div><div className="topic-grid">{exploreTopics.filter(t=>t.id!=='all').map(t=><button key={t.id} className="topic-tile" data-explore-topic={t.id} style={{'--topic-color':t.color}}><strong>{t.name}</strong><span aria-hidden="true">{t.symbol}</span></button>)}</div></section>
  </>;
}

export default function App() {
  const params=new URLSearchParams(location.search);
  const oauthErrors={state:'로그인 요청이 만료되었습니다. 다시 시작해 주세요.',cancelled:'Google 로그인을 취소했습니다.',google:'Google 로그인에 실패했습니다. 다시 시도해 주세요.',existing:'기존 이메일 계정으로 로그인한 후, 프로필에서 Google 계정을 연결해 주세요.',link:'현재 계정과 이메일이 같은 Google 계정을 선택해 주세요.',disabled:'이용이 중지된 계정입니다. 관리자에게 문의해 주세요.'};
  const [initialAuthError]=useState(()=>oauthErrors[params.get('auth_error')]);
  const loginReturn=useRef(params.get('auth')==='success');
  const [user,setUser]=useState(null),[authOpen,setAuthOpen]=useState(Boolean(initialAuthError)),[authChecking,setAuthChecking]=useState(true),[authError,setAuthError]=useState(false);
  const [editing,setEditing]=useState(null),[dirty,setDirty]=useState(false),[postVersion,setPostVersion]=useState(0);
  const [remotePosts,setRemotePosts]=useState([]),[remoteWriters,setRemoteWriters]=useState([]),[feedTotal,setFeedTotal]=useState(0),[feedPage,setFeedPage]=useState(0),[feedError,setFeedError]=useState(''),[feedLoading,setFeedLoading]=useState(false);
  const canWrite=Boolean(user&&['author','admin'].includes(user.role));
  const writers=useMemo(()=>{if(!remotePosts.length)return sampleWriters;const people=new Map(remoteWriters.map(w=>[w.id,{...w,role:'21st ARK 작성자',color:'#dedfce'}]));for(const p of remotePosts)if(!people.has(p.writer.id))people.set(p.writer.id,{...p.writer,role:'21st ARK 작성자',color:'#dedfce'});return [...people.values()];},[remotePosts,remoteWriters]);
  const posts=useMemo(()=>remotePosts.length?remotePosts.map(p=>({...p,author:writers.findIndex(w=>w.id===p.writer.id),date:new Date((p.published_at||p.created_at)*1000).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).replaceAll('-','.'),read:Math.max(1,Math.ceil(p.body.length/500))+'분',art:p.category==='life'?'essay':'code',alt:p.title})):samplePosts,[remotePosts,writers]);
  async function loadFeed(page=0){setFeedLoading(true);setFeedError('');try{const [result,people]=await Promise.all([api('/api/posts?page='+page),api('/api/writers')]);setRemotePosts(p=>page?[...p,...result.posts]:result.posts);setRemoteWriters(people.writers);setFeedTotal(result.total);setFeedPage(page);}catch(e){setFeedError(e.message);}finally{setFeedLoading(false);}}
  function signedIn(account){setEditing(null);setView(['author','admin'].includes(account.role)?'write':'home');setMessage(['author','admin'].includes(account.role)?'로그인했습니다. 새로운 이야기를 써 보세요.':'로그인했습니다. 반가워요!');}
  async function refreshAuth(){setAuthChecking(true);setAuthError(false);try{const body=await api('/api/auth/me');setUser(body.user);if(loginReturn.current&&body.user){loginReturn.current=false;signedIn(body.user);}}catch{setAuthError(true);}finally{setAuthChecking(false);}}
  useEffect(()=>{refreshAuth();},[]);
  useEffect(()=>{loadFeed();if(params.has('auth')||params.has('auth_error')){const url=new URL(location.href);url.searchParams.delete('auth');url.searchParams.delete('auth_error');history.replaceState(null,'',url.href);}},[]);
  useEffect(()=>{const match=location.hash.match(/^#post-([\w-]+)$/);if(match&&!/^\d+$/.test(match[1]))api('/api/posts/'+match[1]).then(r=>setArticle({...r.post,date:new Date(r.post.published_at*1000).toLocaleDateString('ko-KR')})).catch(e=>setMessage(e.message));},[]);
  useEffect(()=>{if(user&&!['author','admin'].includes(user.role)&&['write','my-posts','admin'].includes(view))setView('home');},[user]);
  const [view,setView]=useState('home');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('all');
  const [author,setAuthor]=useState(null);
  const [topicId,setTopicId]=useState('all');
  const [saved,setSaved]=useState(()=>readStored('ark-saved'));
  const [liked,setLiked]=useState(()=>readStored('ark-liked'));
  const [message,setMessage]=useState('');
  const [article,setArticle]=useState(()=>{const match=location.hash.match(/^#post-(\d+)$/);return match?samplePosts.find(p=>p.id===Number(match[1]))??null:null;});
  const searchRef=useRef(null),dialogRef=useRef(null),surfaceRef=useRef(null);
  const title=author!==null?`${writers[author]?.name||'필자'}의 글`:category!=='all'?label(category):{home:'홈',search:'검색',writers:'필자',saved:'저장한 글',write:'글 쓰기','my-posts':'나의 글',admin:'멤버 관리'}[view];
  useEffect(()=>{document.title=`${title} | 21st ARK`;},[title]);
  useEffect(()=>{if(view==='search')searchRef.current?.focus({preventScroll:true});},[view]);
  useEffect(()=>{if(article&&!dialogRef.current.open)dialogRef.current.showModal();else if(!article&&dialogRef.current.open)dialogRef.current.close();},[article]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),2400);return ()=>clearTimeout(timer);},[message]);
  const navigate=next=>{if(dirty&&!window.confirm('저장하지 않은 변경 사항이 있습니다. 이동할까요?'))return false;if(['write','my-posts'].includes(next)&&!canWrite){setAuthOpen(true);return false;}if(next==='admin'&&user?.role!=='admin')return false;if(next==='write')setEditing(null);setDirty(false);setView(next);setCategory('all');setAuthor(null);setQuery('');setTopicId('all');surfaceRef.current?.scrollTo({top:0,behavior:'instant'});return true;};
  const markDirty=useCallback(value=>setDirty(value),[]);
  function editPost(post){if(dirty&&!window.confirm('저장하지 않은 변경 사항이 있습니다. 다른 글을 열까요?'))return;setEditing(post);setDirty(false);setView('write');setArticle(null);setCategory('all');setAuthor(null);surfaceRef.current?.scrollTo({top:0,behavior:'instant'});}
  function savedPost(post){setEditing(post);setDirty(false);setPostVersion(v=>v+1);setMessage(post.status==='published'?'글을 발행했습니다.':'임시저장했습니다.');loadFeed();}
  const toggle=(id,values,setValues,key)=>{const next=new Set(values);next.has(id)?next.delete(id):next.add(id);setValues(next);try{localStorage.setItem(key,JSON.stringify([...next]));}catch{setMessage('이 브라우저에서는 저장 기능을 사용할 수 없어요.');}return next.has(id);};
  async function onAction(event) {
    const button=event.target.closest('button');if(!button)return;
    const d=button.dataset;
    if(d.view==='settings')setArticle('settings');else if(d.view)navigate(d.view);
    if(d.exploreTopic)setTopicId(d.exploreTopic);
    if(d.author!==undefined){navigate('home');setAuthor(Number(d.author));}
    if(d.category){const next=category===d.category?'all':d.category;navigate('home');setCategory(next);}
    if(d.post)setArticle(posts.find(p=>String(p.id)===d.post));
    const postId=value=>/^\d+$/.test(value)?Number(value):value;
    if(d.like)toggle(postId(d.like),liked,setLiked,'ark-liked');
    if(d.save){const added=toggle(postId(d.save),saved,setSaved,'ark-saved');setMessage(added?'저장한 글에 담았어요.':'저장한 글에서 삭제했어요.');}
    if(d.share){const url=new URL(location.href);url.hash=`post-${d.share}`;try{await navigator.clipboard.writeText(url.href);setMessage('글 링크를 복사했어요.');}catch{setMessage('이 브라우저에서는 링크를 복사할 수 없어요.');}}
    if(button.id==='clear-search'){setQuery('');searchRef.current?.focus();}
  }
  const shown=posts.filter(p=>(category==='all'||p.category===category)&&(author===null||p.author===author)&&(view!=='saved'||saved.has(p.id))&&`${p.title} ${p.summary} ${writers[p.author].name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const people=writers.map((w,i)=><button key={i} className="person-row" data-author={i}><Avatar writer={w}/><span><strong>{w.name}</strong><small>{w.role}</small></span></button>);
  const chips=exploreTopics.map(t=><button key={t.id} data-explore-topic={t.id} aria-pressed={t.id===topicId} className={t.id===topicId?'selected':''}>{t.name}</button>);
  return <>
    <AppShell view={view} title={title} query={query} category={category} onSearch={e=>setQuery(e.target.value)} onAction={onAction} searchRef={searchRef} surfaceRef={surfaceRef} chips={chips} people={people} user={user} onProfile={()=>{setAuthOpen(true);refreshAuth();}}>
      {view==='write'&&canWrite?<Editor key={user.id+':'+(editing?.id||'new')} user={user} post={editing} onSaved={savedPost} onDirty={markDirty}/>:view==='my-posts'&&canWrite?<MyPosts onEdit={editPost} onNew={()=>navigate('write')} refreshKey={postVersion}/>:view==='admin'&&user?.role==='admin'?<AdminPanel user={user}/>:<>{feedError&&<p className="auth-error" role="alert">글을 불러오지 못했습니다. <button className="text-button" onClick={()=>loadFeed()}>다시 시도</button></p>}{view==='search'?<Explore query={query} topicId={topicId} posts={posts} writers={writers}/>:view==='writers'?<div className="writer-grid">{writers.map((w,i)=><button key={i} className="writer-card" data-author={i}><Avatar writer={w}/><strong>{w.name}</strong><p>{w.role}</p><small>작성한 글 보기 ↗</small></button>)}</div>:shown.length?shown.map((p,i)=><Post key={p.id} post={p} writer={writers[p.author]} first={i===0} liked={liked.has(p.id)} saved={saved.has(p.id)}/>):<div className="empty">{view==='saved'?<>아직 저장한 글이 없어요.<br/>글 아래의 책갈피를 눌러 모아 보세요.</>:<>일치하는 글이 없어요.<br/>다른 검색어나 관심사를 선택해 보세요.</>}</div>}{remotePosts.length<feedTotal&&<button className="pill load-more" disabled={feedLoading} onClick={()=>loadFeed(feedPage+1)}>{feedLoading?'불러오는 중…':'글 더 보기'}</button>}</>}
    </AppShell>
    <AuthDialog open={authOpen} onClose={()=>setAuthOpen(false)} user={user} setUser={setUser} checking={authChecking} connectionError={authError} refresh={refreshAuth} onSignedIn={signedIn} onNavigate={navigate} initialError={initialAuthError}/>
    <dialog className="article-dialog" ref={dialogRef} onClose={()=>setArticle(null)} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setArticle(null);}}}><button className="dialog-close pill" aria-label="닫기" onClick={()=>setArticle(null)}>닫기 ×</button><div className="article-content">{article==='settings'?<><h2>화면 설정</h2><p>21st ARK는 다크 모드로 표시됩니다.</p><p className="sample-note">저장한 글과 좋아요는 이 브라우저에 보관됩니다. 첫 글이 발행되기 전에는 예시 글이 표시됩니다.</p></>:article?<><p className="article-meta">{article.writer?.name||sampleWriters[article.author]?.name} · {label(article.category)} · {article.date}</p><h2>{article.title}</h2>{article.image&&<img className="article-cover" src={article.image} alt={article.title}/>}<p>{article.body}</p>{article.writer&&canWrite&&(user.role==='admin'||article.writer.id===user.id)&&<button className="pill" onClick={()=>editPost(article)}>글 수정</button>}{!article.writer&&<p className="sample-note">화면 확인을 위한 예시 글입니다.</p>}</>:null}</div></dialog>
    <div className="toast" role="status" hidden={!message}>{message}</div>
  </>;
}
