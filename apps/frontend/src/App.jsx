import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AppShell from './AppShell';
import AuthDialog from './AuthDialog';
import MyPosts from './MyPosts';
import DocumentBody from './DocumentBody';
const Editor=lazy(()=>import('./Editor'));
import AdminPanel from './AdminPanel';
import WriterPage from './WriterPage';
import { PostCard, WriterList, EmptyState, Explore, topicName, postDate } from './ContentViews';
import { api, jsonRequest } from './api';

const oauthErrors = { state: '로그인 요청이 만료되었습니다. 다시 시작해 주세요.', cancelled: 'Google 로그인을 취소했습니다.', google: 'Google 로그인에 실패했습니다. 다시 시도해 주세요.', existing: '기존 이메일 계정으로 로그인한 후, 프로필에서 Google 계정을 연결해 주세요.', link: '현재 계정과 이메일이 같은 Google 계정을 선택해 주세요.', disabled: '이용이 중지된 계정입니다. 관리자에게 문의해 주세요.' };
const emptyFeed = { key: '', posts: [], total: 0, page: 0, loading: true, error: '' };
const browsing = ['home', 'search', 'saved', 'author', 'subscriptions'];

export default function App() {
  const params = new URLSearchParams(location.search);
  const [initialAuthError] = useState(() => oauthErrors[params.get('auth_error')]);
  const loginReturn = useRef(params.get('auth') === 'success');
  const [user, setUser] = useState(null), [authOpen, setAuthOpen] = useState(Boolean(initialAuthError)), [authChecking, setAuthChecking] = useState(true), [authError, setAuthError] = useState(false);
  const [view, setView] = useState('home'), [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [author, setAuthor] = useState(null), [topicId, setTopicId] = useState('all');
  const [editing, setEditing] = useState(null), [dirty, setDirty] = useState(false), [version, setVersion] = useState(0), [requestPage, setRequestPage] = useState(0);
  const [feed, setFeed] = useState(emptyFeed), [topics, setTopics] = useState([]), [writers, setWriters] = useState([]), [writerTotal, setWriterTotal] = useState(0), [writerPage, setWriterPage] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true), [catalogError, setCatalogError] = useState('');
  const [searchWriters, setSearchWriters] = useState({ writers: [], loading: false, error: '' });
  const [pending, setPending] = useState(new Set()), [message, setMessage] = useState('');
  const [article, setArticle] = useState(null);
  const [subscriptionVersion,setSubscriptionVersion]=useState(0);
  const activeUserId=useRef(user?.id);activeUserId.current=user?.id;
  const searchRef = useRef(null), dialogRef = useRef(null), surfaceRef = useRef(null), articleRequest = useRef(0), reactionRequests=useRef(new Set());
  const canWrite = Boolean(user && ['author', 'admin'].includes(user.role));
  const canStartPost = canWrite && (view !== 'author' || author?.id === user.id);
  const criteria = JSON.stringify({ bookmarked: view === 'saved' ? '1' : undefined, subscribed:view==='subscriptions'?'1':undefined, q: view === 'search' ? query.trim() : undefined, category, author: author?.id, topic: view === 'search' ? topicId : undefined });
  const feedKey = criteria + ':' + (user?.id ?? 'anonymous');
  const currentFeed = feed.key === feedKey ? feed : { ...emptyFeed, key: feedKey };
  const title = author ? author.name || '필자 프로필' : category !== 'all' ? topicName(topics, category) : { home: '홈', search: '검색', writers: '필자', saved: '저장한 글', subscriptions:'구독한 글', write: '글 쓰기', 'my-posts': '내 글 관리', admin: '멤버 관리' }[view];
  const refreshContent = () => { setRequestPage(0); setVersion(v => v + 1); };

  function signedIn(account) {
    setEditing(null); setDirty(false); setView(['author', 'admin'].includes(account.role) ? 'write' : 'home');
    setMessage(['author', 'admin'].includes(account.role) ? '로그인했습니다. 새로운 글을 써 보세요.' : '로그인했습니다. 반가워요!');
  }
  async function refreshAuth() {
    setAuthChecking(true); setAuthError(false);
    try { const body = await api('/api/auth/me'); setUser(body.user); if (loginReturn.current && body.user) { loginReturn.current = false; signedIn(body.user); } }
    catch { setAuthError(true); } finally { setAuthChecking(false); }
  }
  useEffect(() => {
    refreshAuth();
    if (params.has('auth') || params.has('auth_error')) { const url = new URL(location.href); url.searchParams.delete('auth'); url.searchParams.delete('auth_error'); history.replaceState(null, '', url.href); }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setCatalogLoading(true); setCatalogError('');
    Promise.all([api('/api/topics', { signal: controller.signal }), api('/api/writers', { signal: controller.signal })]).then(([catalog, people]) => {
      if (controller.signal.aborted) return;
      setTopics(catalog.topics); setWriters(people.writers); setWriterTotal(people.total); setWriterPage(0);
    }).catch(e => { if (!controller.signal.aborted) setCatalogError(e.message); }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [version, user?.role, user?.name]);
  useEffect(() => {
    if (!browsing.includes(view) || (['saved','subscriptions'].includes(view) && !user)) return;
    const controller = new AbortController();
    setFeed(previous => ({ ...(previous.key === feedKey ? previous : emptyFeed), key: feedKey, loading: true, error: '' }));
    const timer = setTimeout(() => {
      const filters = Object.entries(JSON.parse(criteria)).filter(([, value]) => value !== undefined);
      api('/api/posts?' + new URLSearchParams([...filters, ['page', String(requestPage)]]), { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        setFeed(previous => ({ key: feedKey, posts: requestPage && previous.key === feedKey ? [...new Map([...previous.posts, ...result.posts].map(p => [p.id, p])).values()] : result.posts, total: result.total, page: result.page, loading: false, error: '' }));
      }).catch(e => { if (!controller.signal.aborted) setFeed(previous => ({ ...previous, loading: false, error: e.message })); });
    }, view === 'search' ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [view, criteria, feedKey, requestPage, version, subscriptionVersion]);
  useEffect(() => {
    if (view !== 'search') return;
    const controller = new AbortController(); setSearchWriters({ writers: [], loading: true, error: '' });
    const timer = setTimeout(() => api('/api/writers?' + new URLSearchParams({ q: query.trim(), topic: topicId }), { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setSearchWriters({ writers: result.writers, loading: false, error: '' });
    }).catch(e => { if (!controller.signal.aborted) setSearchWriters({ writers: [], loading: false, error: e.message }); }), 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [view, query, topicId, version]);
  useEffect(() => { document.title = title + ' | 21st ARK'; }, [title]);
  useEffect(() => { if (view === 'search') searchRef.current?.focus({ preventScroll: true }); }, [view]);
  useEffect(() => { if (article && !dialogRef.current.open) dialogRef.current.showModal(); else if (!article && dialogRef.current.open) dialogRef.current.close(); }, [article]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    setArticle(null);
    if ((!user || user.role === 'reader') && ['write', 'my-posts', 'admin'].includes(view)) setView('home');
    else if (user?.role !== 'admin' && view === 'admin') setView('home');
  }, [user?.id, user?.role]);
  useEffect(() => {
    const readHash = () => { const post = location.hash.match(/^#post-([\w-]+)$/), writer = location.hash.match(/^#writer-([\w-]+)$/); if (post) openArticle(post[1], false); else { closeArticle(); setAuthor(writer?{id:writer[1],name:''}:null); setView(writer?'author':'home'); setRequestPage(0); } };
    readHash(); window.addEventListener('hashchange', readHash); window.addEventListener('popstate', readHash);
    return () => { window.removeEventListener('hashchange', readHash); window.removeEventListener('popstate', readHash); };
  }, []);

  const writerLoaded = useCallback(writer=>setAuthor(previous=>previous?.id===writer.id&&previous.name!==writer.name?{id:writer.id,name:writer.name}:previous),[]);
  const markDirty = useCallback(value => setDirty(value), []);
  function navigate(next) {
    if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 이동할까요?')) return false;
    if (['write', 'my-posts'].includes(next) && !canWrite) { setAuthOpen(true); return false; }
    if (next === 'admin' && user?.role !== 'admin') return false;
    if (next === 'write') setEditing(null);
    if(location.hash){history.pushState(null,'',location.pathname+location.search);closeArticle();}
    setDirty(false); setView(next); setCategory('all'); setAuthor(null); setQuery(''); setTopicId('all'); setRequestPage(0);
    surfaceRef.current?.scrollTo({ top: 0, behavior: 'instant' }); return true;
  }
  function openWriter(id,name='') {
    if(!navigate('author'))return;
    setAuthor({id,name});const url=new URL(location.href);url.hash='writer-'+id;history.replaceState(null,'',url.href);
  }
  function editPost(post) {
    if (!navigate('write')) return;
    setEditing(post); closeArticle();
  }
  function savedPost(post) { setEditing(post); setDirty(false); setMessage(post.status === 'published' ? '글을 업로드했습니다.' : '임시저장했습니다.'); refreshContent(); }
  async function openArticle(id, updateHash = true) {
    const request = ++articleRequest.current;
    try { const result = await api('/api/posts/' + id); if (request !== articleRequest.current) return; setArticle(result.post); if (updateHash) { const url = new URL(location.href); url.hash = 'post-' + id; history.pushState(null, '', url.href); } }
    catch (e) { setMessage(e.message); }
  }
  function closeArticle() {
    articleRequest.current++; setArticle(null);
    if (location.hash.startsWith('#post-')) { const url = new URL(location.href); url.hash = author ? 'writer-'+author.id : ''; history.replaceState(null, '', url.href); }
  }
  async function reactToPost(id, kind) {
    if (!user) { setAuthOpen(true); setMessage('로그인하면 좋아요와 저장한 글이 계정에 보관됩니다.'); return; }
    if (reactionRequests.current.has(id)) return;
    const post = currentFeed.posts.find(p => p.id === id) ?? (article?.id === id ? article : null);
    if (!post) return;
    reactionRequests.current.add(id);setPending(values => new Set([...values,id]));
    try {
      const result = await api('/api/posts/' + id + '/' + kind, jsonRequest('PUT', { active: !(kind === 'like' ? post.liked : post.saved) }));
      if(activeUserId.current!==user.id)return;
      setFeed(previous => ({ ...previous, posts: previous.posts.map(p => p.id === id ? { ...p, ...result.post } : p) }));
      setArticle(previous => previous?.id === id ? { ...previous, ...result.post } : previous);
      if (kind === 'bookmark') { setMessage(result.post.saved ? '저장한 글에 담았어요.' : '저장한 글에서 삭제했어요.'); if (view === 'saved' && !result.post.saved) refreshContent(); }
    } catch (e) { setMessage(e.message); if (e.status === 401) refreshAuth(); }
    finally { reactionRequests.current.delete(id);setPending(values => { const next = new Set(values); next.delete(id); return next; }); }
  }
  async function onAction(event) {
    const button = event.target.closest('button'); if (!button) return;
    const d = button.dataset;
    if (d.view === 'settings') setArticle('settings'); else if (d.view) navigate(d.view);
    if (d.exploreTopic) { if(view==='search'){setTopicId(d.exploreTopic);setRequestPage(0);}else if(navigate('search'))setTopicId(d.exploreTopic); }
    if (d.author) openWriter(d.author,d.authorName);
    if (d.category) { const next = category === d.category ? 'all' : d.category; if (navigate('home')) setCategory(next); }
    if (d.post) openArticle(d.post);
    if (d.like) reactToPost(d.like, 'like');
    if (d.save) reactToPost(d.save, 'bookmark');
    if (d.share) { const url = new URL(location.origin + '/'); url.hash = 'post-' + d.share; try { await navigator.clipboard.writeText(url.href); setMessage('글 링크를 복사했어요.'); } catch { setMessage('이 브라우저에서는 링크를 복사할 수 없어요.'); } }
    if (button.id === 'clear-search') { setQuery(''); setRequestPage(0); searchRef.current?.focus(); }
  }
  async function moreWriters() { try { const result = await api('/api/writers?page=' + (writerPage + 1)); setWriters(previous => [...new Map([...previous, ...result.writers].map(w => [w.id, w])).values()]); setWriterPage(result.page); setWriterTotal(result.total); } catch (e) { setMessage(e.message); } }
  const chips = [{ id: 'all', name: '전체' }, ...topics].map(t => <button key={t.id} data-explore-topic={t.id} aria-pressed={t.id === topicId} className={t.id === topicId ? 'selected' : ''}>{t.name}</button>);


  let content;
  if (view === 'write' && canWrite) content = <Suspense fallback={<p role="status">글쓰기 화면을 불러오고 있어요.</p>}><Editor key={user.id + ':' + (editing?.id || 'new')} user={user} post={editing} topics={topics} onSaved={savedPost} onDirty={markDirty}/></Suspense>;
  else if (view === 'my-posts' && canWrite) content = <MyPosts onEdit={editPost} onNew={() => navigate('write')} refreshKey={version}/>;
  else if (view === 'admin' && user?.role === 'admin') content = <AdminPanel user={user} onChanged={refreshContent}/>;

  else if (view === 'writers') content = catalogLoading ? <p role="status">필자를 불러오고 있어요.</p> : catalogError ? null : writers.length ? <><WriterList writers={writers}/>{writers.length < writerTotal && <button className="pill load-more" onClick={moreWriters}>필자 더 보기</button>}</> : <EmptyState title="아직 등록된 필자가 없어요."/>;
  else if (['saved','subscriptions'].includes(view) && !user) content = authChecking ? <p role="status">로그인 상태를 확인하고 있어요.</p> : <EmptyState title={view==='subscriptions'?'구독한 필자의 새 글을 모아 보세요.':'저장한 글을 계정에서 모아 보세요.'} action="로그인" onAction={() => setAuthOpen(true)}>로그인하면 다른 기기에서도 이어서 볼 수 있어요.</EmptyState>;
  else if (view === 'search') content = <Explore topics={topics} writers={searchWriters.writers} writersLoading={searchWriters.loading} writersError={searchWriters.error} posts={currentFeed.posts} total={currentFeed.total} query={query} topicId={topicId} loading={currentFeed.loading} error={currentFeed.error}/>;
  else if (currentFeed.loading && !currentFeed.posts.length) content = <p className="content-loading" role="status">글을 불러오고 있어요.</p>;
  else if (currentFeed.posts.length) content = currentFeed.posts.map((p, i) => <PostCard key={p.id} post={p} topics={topics} first={i === 0} pending={pending}/>);
  else if (!currentFeed.error) content = <EmptyState title={view==='subscriptions'?'구독한 필자의 새 글이 없어요.':view === 'saved' ? '아직 저장한 글이 없어요.' : author || category !== 'all' ? '아직 업로드된 글이 없어요.' : '아직 업로드된 글이 없어요.'} action={!['saved','subscriptions'].includes(view) && canStartPost ? '첫 글 쓰기' : undefined} onAction={() => navigate('write')}>{view==='subscriptions'?<>필자 페이지에서 구독하면 새 글을 이곳에서 볼 수 있어요. <button className="text-button" data-view="writers">필자 둘러보기</button></>:view === 'saved' ? '글 아래의 책갈피를 눌러 모아 보세요.' : canStartPost ? '첫 번째 글을 작성해 보세요.' : '새로운 글이 올라오면 이곳에서 읽을 수 있어요.'}</EmptyState>;

  return <>
    <AppShell view={view} title={title} query={query} category={category} onSearch={e => { setQuery(e.target.value); setRequestPage(0); }} onAction={onAction} searchRef={searchRef} surfaceRef={surfaceRef} chips={chips} sidebarRefresh={version+':'+subscriptionVersion} onLogin={()=>setAuthOpen(true)} user={user} onProfile={() => { if(user)openWriter(user.id,user.name);else{setAuthOpen(true);refreshAuth();} }}>
      {view!=='author' && catalogError && <p className="auth-error" role="alert">필자와 주제를 불러오지 못했습니다. <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {browsing.includes(view) && currentFeed.error && <p className="auth-error" role="alert">{currentFeed.error} <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {view==='author'&&author?<WriterPage key={author.id} id={author.id} user={user} version={version} onLoaded={writerLoaded} onLogin={()=>setAuthOpen(true)} onSubscriptionChange={()=>setSubscriptionVersion(v=>v+1)} onSaved={account=>{setUser(account);setAuthor({id:account.id,name:account.name});refreshContent();}} onAccount={()=>setAuthOpen(true)} onShare={async id=>{try{await navigator.clipboard.writeText(location.origin+'/#writer-'+id);setMessage('프로필 링크를 복사했어요.');}catch{setMessage('프로필 링크를 복사하지 못했습니다.');}}}>{content}{currentFeed.posts.length<currentFeed.total&&<button className="pill load-more" disabled={currentFeed.loading} onClick={()=>setRequestPage(currentFeed.page+1)}>글 더 보기</button>}</WriterPage>:content}
      {view!=='author' && browsing.includes(view) && currentFeed.posts.length < currentFeed.total && <button className="pill load-more" disabled={currentFeed.loading} onClick={() => { setRequestPage(currentFeed.page + 1); if (currentFeed.error) setVersion(v => v + 1); }}>{currentFeed.loading ? '불러오는 중…' : '글 더 보기'}</button>}
    </AppShell>
    <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} user={user} setUser={account => { setUser(account); if(account&&author?.id===account.id)setAuthor({id:account.id,name:account.name}); refreshContent(); }} checking={authChecking} connectionError={authError} refresh={refreshAuth} onSignedIn={signedIn} onNavigate={next=>next==='author'&&user?openWriter(user.id,user.name):navigate(next)} initialError={initialAuthError}/>
    <dialog className="article-dialog" ref={dialogRef} onClose={closeArticle} onCancel={closeArticle}><button className="dialog-close pill" aria-label="닫기" onClick={closeArticle}>닫기 ×</button><div className="article-content">{article === 'settings' ? <><h2>화면 설정</h2><p>21st ARK는 다크 모드로 표시됩니다.</p><p>글과 프로필, 좋아요, 저장한 글은 계정에 연결해 보관합니다.</p></> : article ? <><p className="article-meta"><button className="text-button" onClick={()=>{const writer=article.writer;closeArticle();openWriter(writer.id,writer.name);}}>{article.writer.name}</button> · {topicName(topics, article.category)} · {postDate(article)}</p><h2>{article.title}</h2>{article.image && <img className="article-cover" src={article.image} alt={article.title}/>}<DocumentBody post={article}/><div className="article-tags">{article.topic_ids.map(id => <span className="status-tag" key={id}>{topicName(topics, id)}</span>)}</div>{canWrite && (user.role === 'admin' || article.writer.id === user.id) && <button className="pill" onClick={() => editPost(article)}>글 수정</button>}</> : null}</div></dialog>
    <div className="toast" role="status" hidden={!message}>{message}</div>
  </>;
}
