import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AppShell from './AppShell';
import AuthDialog from './AuthDialog';
import SignupDialog from './SignupDialog';
import SettingsDialog from './SettingsDialog';
import MyPosts from './MyPosts';
import ArticlePage from './ArticlePage';
const Editor=lazy(()=>import('./Editor'));
let readQueue=Promise.resolve();
import AdminPanel from './AdminPanel';
import WriterPage from './WriterPage';
import { PostCard, WriterList, EmptyState, Explore, topicName } from './ContentViews';
import { api, jsonRequest } from './api';

const oauthErrors = { state: '로그인 요청이 만료되었습니다. 다시 시작해 주세요.', cancelled: '로그인을 취소했습니다.', google: 'Google 로그인에 실패했습니다. 다시 시도해 주세요.', github: 'GitHub 로그인에 실패했습니다. 다시 시도해 주세요.', github_email: 'GitHub에서 기본 이메일 인증을 마친 뒤 다시 로그인해 주세요.', existing: '이미 가입된 이메일입니다. 기존에 연결한 서비스로 로그인한 후, 계정 및 설정에서 다른 로그인 계정을 연결해 주세요.', link: '현재 계정과 인증된 기본 이메일이 같은 계정을 선택해 주세요.', disabled: '이용이 중지된 계정입니다. 관리자에게 문의해 주세요.' };
const emptyFeed = { key: '', posts: [], total: 0, page: 0, loading: true, error: '' };
const browsing = ['home', 'search', 'saved', 'author', 'subscriptions'];

export default function App() {
  const params = new URLSearchParams(location.search);
  const [signup,setSignup]=useState(null);
  const [initialAuthError] = useState(() => oauthErrors[params.get('auth_error')]);
  const loginReturn = useRef(params.get('auth') === 'success');
  const [user, setUser] = useState(null), [authOpen, setAuthOpen] = useState(Boolean(initialAuthError)), [authChecking, setAuthChecking] = useState(true), [authError, setAuthError] = useState(false);
  const [view, setView] = useState('home'), [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [author, setAuthor] = useState(null), [topicId, setTopicId] = useState('all');
  const [editing, setEditing] = useState(null), [dirty, setDirty] = useState(false), [version, setVersion] = useState(0), [requestPage, setRequestPage] = useState(0);
  const [feed, setFeed] = useState(emptyFeed), [topics, setTopics] = useState([]), [writers, setWriters] = useState([]), [writerTotal, setWriterTotal] = useState(0), [writerPage, setWriterPage] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true), [catalogError, setCatalogError] = useState('');
  const [searchWriters, setSearchWriters] = useState({ writers: [], loading: false, error: '' });
  const [pending, setPending] = useState(new Set()), [message, setMessage] = useState('');
  const [article, setArticle] = useState(null),[articleId,setArticleId]=useState(null),[articleLoading,setArticleLoading]=useState(false),[articleError,setArticleError]=useState('');
  const articleIdRef=useRef(null),articleReturn=useRef(null),readerScroll=useRef(null),readerFocus=useRef(null),lastRoute=useRef(null);
  const [subscriptionVersion,setSubscriptionVersion]=useState(0);
  const [writerFilters,setWriterFilters]=useState({category:null,tag:null}),[taxonomyVersion,setTaxonomyVersion]=useState(0);
  const [settings,setSettings]=useState(null),[loggingOut,setLoggingOut]=useState(false);
  const activeUserId=useRef(user?.id);activeUserId.current=user?.id;
  const searchRef = useRef(null), surfaceRef = useRef(null), articleRequest = useRef(0), reactionRequests=useRef(new Set());
  const canWrite = Boolean(user && ['author', 'admin'].includes(user.role));
  const canStartPost = canWrite && (view !== 'author' || author?.id === user.id);
  const criteria = JSON.stringify({ bookmarked: view === 'saved' ? '1' : undefined, subscribed:view==='subscriptions'?'1':undefined, q: view === 'search' ? query.trim() : undefined, category, author: author?.id, topic: view === 'search' ? topicId : undefined,writer_category:view==='author'?writerFilters.category??undefined:undefined,writer_tag:view==='author'?writerFilters.tag??undefined:undefined });
  const feedKey = criteria + ':' + (user?.id ?? 'anonymous');
  const currentFeed = feed.key === feedKey ? feed : { ...emptyFeed, key: feedKey };
  const title = author ? author.name || '필자 프로필' : category !== 'all' ? topicName(topics, category) : { home: '홈', search: '검색', writers: '필자', saved: '저장한 포스트', subscriptions:'구독한 포스트', write: '포스트 작성', 'my-posts': '내 포스트 관리', admin: '멤버 관리' }[view];
  const refreshContent = () => { setRequestPage(0); setVersion(v => v + 1); };

  function signedIn(account) {
    setEditing(null); setDirty(false);
    let returnPost=null;try{const saved=JSON.parse(sessionStorage.getItem('ark-auth-return-post'));sessionStorage.removeItem('ark-auth-return-post');if(saved&&typeof saved.id==='string'&&typeof saved.at==='number'&&/^[\w-]{1,100}$/.test(saved.id)&&Date.now()-saved.at>=0&&Date.now()-saved.at<1800000)returnPost=saved.id;}catch{}
    if(returnPost){setView('home');setAuthor(null);openArticle(returnPost);setMessage('로그인했습니다.');return;}
    setView(['author', 'admin'].includes(account.role) ? 'write' : 'home');
    setMessage(['author', 'admin'].includes(account.role) ? '로그인했습니다. 새로운 포스트를 써 보세요.' : '로그인했습니다. 반가워요!');
  }
  function rememberLoginReturn(){try{if(articleIdRef.current)sessionStorage.setItem('ark-auth-return-post',JSON.stringify({id:articleIdRef.current,at:Date.now()}));else if(!initialAuthError)sessionStorage.removeItem('ark-auth-return-post');}catch{}}
  function closeAuthDialog(){setAuthOpen(false);try{sessionStorage.removeItem('ark-auth-return-post');}catch{}}
  async function refreshAuth() {
    setAuthChecking(true); setAuthError(false);
    try { const body = await api('/api/auth/me'); setUser(body.user); setSignup(body.signup??null); if(body.signup)setAuthOpen(false); else if(params.get('auth')==='signup'&&!body.user){setAuthOpen(true);setMessage('가입 인증이 만료되었습니다. 소셜 로그인을 다시 시작해 주세요.');} if (loginReturn.current && body.user) { loginReturn.current = false; signedIn(body.user); } }
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
  }, [view, criteria, feedKey, requestPage, version, subscriptionVersion, taxonomyVersion]);
  useEffect(() => {
    if (view !== 'search') return;
    const controller = new AbortController(); setSearchWriters({ writers: [], loading: true, error: '' });
    const timer = setTimeout(() => api('/api/writers?' + new URLSearchParams({ q: query.trim(), topic: topicId }), { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setSearchWriters({ writers: result.writers, loading: false, error: '' });
    }).catch(e => { if (!controller.signal.aborted) setSearchWriters({ writers: [], loading: false, error: e.message }); }), 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [view, query, topicId, version]);
  useEffect(() => { document.title = (articleId?(article?.title??'포스트 읽기'):title) + ' | 21st ARK'; }, [title,articleId,article?.title]);
  useEffect(() => { if (view === 'search'&&!articleId) searchRef.current?.focus({ preventScroll: true }); }, [view,articleId]);
  useLayoutEffect(()=>{
    if(readerScroll.current===null||(!articleId&&browsing.includes(view)&&currentFeed.loading))return;
    surfaceRef.current?.scrollTo({top:readerScroll.current,behavior:'instant'});readerScroll.current=null;
    if(!articleId&&readerFocus.current?.isConnected){readerFocus.current.focus({preventScroll:true});readerFocus.current=null;}
  },[articleId,view,feedKey,currentFeed.loading]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if(articleIdRef.current)openArticle(articleIdRef.current,false,true);
    if ((!user || user.role === 'reader') && ['write', 'my-posts', 'admin'].includes(view)) setView('home');
    else if (user?.role !== 'admin' && view === 'admin') setView('home');
  }, [user?.id, user?.role]);
  useEffect(() => {
    const readHash=()=>{
      if(lastRoute.current===location.href)return;lastRoute.current=location.href;
      const post=location.hash.match(/^#post-([\w-]+)$/),writer=location.hash.match(/^#writer-([\w-]+)$/),snapshot=history.state?.arkBrowse;
      if(post){if(snapshot){articleReturn.current=snapshot;restoreBrowse(snapshot);}openArticle(post[1],false);}
      else{clearArticle();if(snapshot)restoreBrowse(snapshot);else{setAuthor(writer?{id:writer[1],name:''}:null);setWriterFilters({category:null,tag:null});setCategory('all');setQuery('');setTopicId('all');setView(writer?'author':'home');setRequestPage(0);readerScroll.current=0;}}
    };
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
    if(location.hash)history.pushState(null,'',location.pathname+location.search);
    clearArticle();lastRoute.current=location.href;
    setWriterFilters({category:null,tag:null});setDirty(false); setView(next); setCategory('all'); setAuthor(null); setQuery(''); setTopicId('all'); setRequestPage(0);
    surfaceRef.current?.scrollTo({ top: 0, behavior: 'instant' }); return true;
  }
  function openWriter(id,name='') {
    if(!navigate('author'))return;
    setAuthor({id,name});const url=new URL(location.href);url.hash='writer-'+id;history.replaceState(null,'',url.href);lastRoute.current=url.href;
  }
  function editPost(post) {
    if (!navigate('write')) return;
    setEditing(post);
  }
  function savedPost(post) { setEditing(null);setDirty(false);setView('my-posts');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');setMessage(post.status === 'published' ? '포스트를 업로드했습니다.' : '임시저장했습니다.');refreshContent();openArticle(post.id,true,false,{view:'my-posts',category:'all',author:null,query:'',topicId:'all',requestPage:0,writerFilters:{category:null,tag:null},scrollTop:0}); }
  async function logout(){
    if(loggingOut)return;
    if(dirty&&!window.confirm('저장하지 않은 변경 사항이 있습니다. 로그아웃할까요?'))return;
    setLoggingOut(true);
    try{await api('/api/auth/logout',jsonRequest('POST',{}));setUser(null);setDirty(false);setEditing(null);setSettings(null);setAuthOpen(false);setView('home');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');clearArticle();history.replaceState(null,'',location.pathname+location.search);refreshContent();setMessage('로그아웃했습니다.');}
    catch(e){setMessage(e.message);}finally{setLoggingOut(false);}
  }
  function accountDeleted(id){
    try{for(const key of Object.keys(localStorage))if(key.startsWith('ark-draft:'+id+':'))localStorage.removeItem(key);sessionStorage.removeItem('ark-auth-return-post');}catch{}
    setUser(null);setSignup(null);setDirty(false);setEditing(null);setSettings(null);setAuthOpen(false);setView('home');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');clearArticle();history.replaceState(null,'',location.pathname+location.search);refreshContent();setMessage('계정을 삭제했습니다.');
  }
  function restoreBrowse(snapshot){
    setView(snapshot.view??'home');setCategory(snapshot.category??'all');setAuthor(snapshot.author??null);setQuery(snapshot.query??'');setTopicId(snapshot.topicId??'all');setRequestPage(snapshot.requestPage??0);setWriterFilters(snapshot.writerFilters??{category:null,tag:null});readerScroll.current=snapshot.scrollTop??0;
  }
  async function openArticle(id,updateHash=true,refresh=false,returnTo=null){
    const same=articleIdRef.current===id;
    if(updateHash&&!same){
      const snapshot=returnTo??(articleIdRef.current?articleReturn.current:{view,category,author,query,topicId,requestPage,writerFilters,scrollTop:surfaceRef.current?.scrollTop??0});
      articleReturn.current=snapshot;readerFocus.current=document.activeElement;
      if(!articleIdRef.current)history.replaceState({...history.state,arkBrowse:snapshot},'',location.href);
      const url=new URL(location.href);url.hash='post-'+id;history.pushState({arkArticle:true,arkBrowse:snapshot},'',url.href);lastRoute.current=url.href;
    }
    articleIdRef.current=id;setArticleId(id);setArticleError('');setArticleLoading(true);if(!same||refresh)setArticle(null);if(!refresh)readerScroll.current=0;
    const request=++articleRequest.current;
    try{const result=await api('/api/posts/'+id);if(request!==articleRequest.current)return;setArticle(result.post);
      if(!refresh&&result.post.status==='published'&&navigator.doNotTrack!=='1'&&!navigator.globalPrivacyControl){readQueue=readQueue.catch(()=>{}).then(()=>api('/api/posts/'+id+'/view',jsonRequest('POST',{}))).catch(()=>{});}
    }catch(e){if(request===articleRequest.current){setArticle(null);setArticleError(e.message);}}
    finally{if(request===articleRequest.current)setArticleLoading(false);}
  }
  function clearArticle(){articleRequest.current++;articleIdRef.current=null;setArticleId(null);setArticle(null);setArticleLoading(false);setArticleError('');}
  function returnFromArticle(){
    if(history.state?.arkArticle&&history.state?.arkBrowse){history.back();return;}
    if(article?.writer)openWriter(article.writer.id,article.writer.name);else navigate('home');
  }
  async function reactToPost(id, kind) {
    if (!user) { setAuthOpen(true); setMessage('로그인하면 좋아요와 저장한 포스트가 계정에 보관됩니다.'); return; }
    if (reactionRequests.current.has(id)) return;
    const post = currentFeed.posts.find(p => p.id === id) ?? (article?.id === id ? article : null);
    if (!post) return;
    reactionRequests.current.add(id);setPending(values => new Set([...values,id]));
    try {
      const result = await api('/api/posts/' + id + '/' + kind, jsonRequest('PUT', { active: !(kind === 'like' ? post.liked : post.saved) }));
      if(activeUserId.current!==user.id)return;
      setFeed(previous => ({ ...previous, posts: previous.posts.map(p => p.id === id ? { ...p, ...result.post } : p) }));
      setArticle(previous => previous?.id === id ? { ...previous, ...result.post } : previous);
      if (kind === 'bookmark') { setMessage(result.post.saved ? '저장한 포스트에 담았어요.' : '저장한 포스트에서 삭제했어요.'); if (view === 'saved' && !result.post.saved) refreshContent(); }
    } catch (e) { setMessage(e.message); if (e.status === 401) refreshAuth(); }
    finally { reactionRequests.current.delete(id);setPending(values => { const next = new Set(values); next.delete(id); return next; }); }
  }
  async function onAction(event) {
    const button = event.target.closest('button'); if (!button) return;
    const d = button.dataset;
    if (d.view) navigate(d.view);
    if (d.exploreTopic) { if(view==='search'){setTopicId(d.exploreTopic);setRequestPage(0);}else if(navigate('search'))setTopicId(d.exploreTopic); }
    if (d.author) openWriter(d.author,d.authorName);
    if (d.category) { const next = category === d.category ? 'all' : d.category; if (navigate('home')) setCategory(next); }
    if (d.post) openArticle(d.post);
    if (d.like) reactToPost(d.like, 'like');
    if (d.save) reactToPost(d.save, 'bookmark');
    if (d.share) { const url = new URL(location.origin + '/'); url.hash = 'post-' + d.share; try { await navigator.clipboard.writeText(url.href); setMessage('포스트 링크를 복사했어요.'); } catch { setMessage('이 브라우저에서는 링크를 복사할 수 없어요.'); } }
    if (button.id === 'clear-search') { setQuery(''); setRequestPage(0); searchRef.current?.focus(); }
  }
  async function moreWriters() { try { const result = await api('/api/writers?page=' + (writerPage + 1)); setWriters(previous => [...new Map([...previous, ...result.writers].map(w => [w.id, w])).values()]); setWriterPage(result.page); setWriterTotal(result.total); } catch (e) { setMessage(e.message); } }
  const chips = [{ id: 'all', name: '전체' }, ...topics].map(t => <button key={t.id} data-explore-topic={t.id} aria-pressed={t.id === topicId} className={t.id === topicId ? 'selected' : ''}>{t.name}</button>);


  let content;
  if (view === 'write' && canWrite) content = <Suspense fallback={<p role="status">포스트 작성 화면을 불러오고 있어요.</p>}><Editor key={user.id + ':' + (editing?.id || 'new')} user={user} post={editing} topics={topics} onSaved={savedPost} onDirty={markDirty}/></Suspense>;
  else if (view === 'my-posts' && canWrite) content = <MyPosts user={user} onEdit={editPost} refreshKey={version} onChanged={refreshContent}/>;
  else if (view === 'admin' && user?.role === 'admin') content = <AdminPanel user={user} onChanged={refreshContent}/>;

  else if (view === 'writers') content = catalogLoading ? <p role="status">필자를 불러오고 있어요.</p> : catalogError ? null : writers.length ? <><WriterList writers={writers}/>{writers.length < writerTotal && <button className="pill load-more" onClick={moreWriters}>필자 더 보기</button>}</> : <EmptyState title="아직 등록된 필자가 없어요."/>;
  else if (['saved','subscriptions'].includes(view) && !user) content = authChecking ? <p role="status">로그인 상태를 확인하고 있어요.</p> : <EmptyState title={view==='subscriptions'?'구독한 필자의 새 포스트를 모아 보세요.':'저장한 포스트를 계정에서 모아 보세요.'} action="로그인" onAction={() => setAuthOpen(true)}>로그인하면 다른 기기에서도 이어서 볼 수 있어요.</EmptyState>;
  else if (view === 'search') content = <Explore topics={topics} writers={searchWriters.writers} writersLoading={searchWriters.loading} writersError={searchWriters.error} posts={currentFeed.posts} total={currentFeed.total} query={query} topicId={topicId} loading={currentFeed.loading} error={currentFeed.error}/>;
  else if (currentFeed.loading && !currentFeed.posts.length) content = <p className="content-loading" role="status">포스트를 불러오고 있어요.</p>;
  else if (currentFeed.posts.length) content = currentFeed.posts.map((p, i) => <PostCard key={p.id} post={p} topics={topics} first={i === 0} pending={pending}/>);
  else if (!currentFeed.error) content = <EmptyState title={view==='subscriptions'?'구독한 필자의 새 포스트가 없어요.':view === 'saved' ? '아직 저장한 포스트가 없어요.' : author || category !== 'all' ? '아직 업로드된 포스트가 없어요.' : '아직 업로드된 포스트가 없어요.'} action={!['saved','subscriptions'].includes(view) && canStartPost ? '첫 포스트 작성' : undefined} onAction={() => navigate('write')}>{view==='subscriptions'?<>필자 페이지에서 구독하면 새 포스트를 이곳에서 볼 수 있어요. <button className="text-button" data-view="writers">필자 둘러보기</button></>:view === 'saved' ? '포스트 아래의 책갈피를 눌러 모아 보세요.' : canStartPost ? '첫 번째 포스트를 작성해 보세요.' : '새로운 포스트가 올라오면 이곳에서 읽을 수 있어요.'}</EmptyState>;

  return <>
    <AppShell reading={Boolean(articleId)} onBack={returnFromArticle} reader={<ArticlePage post={article} loading={articleLoading} error={articleError} topics={topics} user={user} pending={pending} onRetry={()=>openArticle(articleId,false)} onEdit={editPost} onLogin={()=>{setAuthOpen(true);refreshAuth();}}/>} view={view} title={title} query={query} category={category} onSearch={e => { setQuery(e.target.value); setRequestPage(0); }} onAction={onAction} searchRef={searchRef} surfaceRef={surfaceRef} chips={chips} onSettings={setSettings} onLogout={logout} loggingOut={loggingOut} onAdmin={()=>navigate('admin')} sidebarRefresh={version+':'+subscriptionVersion} onLogin={()=>setAuthOpen(true)} user={user} onProfile={() => { if(user)openWriter(user.id,user.name);else{setAuthOpen(true);refreshAuth();} }}>
      {view!=='author' && catalogError && <p className="auth-error" role="alert">필자와 주제를 불러오지 못했습니다. <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {browsing.includes(view) && currentFeed.error && <p className="auth-error" role="alert">{currentFeed.error} <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {view==='author'&&author?<WriterPage key={author.id} id={author.id} user={user} version={version} taxonomyVersion={taxonomyVersion} filters={writerFilters} onFilter={(kind,id)=>{setWriterFilters(previous=>kind==='clear'?{category:null,tag:null}:{...previous,[kind]:previous[kind]===id?null:id});setRequestPage(0);}} onTaxonomyChanged={()=>{setTaxonomyVersion(value=>value+1);setWriterFilters({category:null,tag:null});setRequestPage(0);}} onLoaded={writerLoaded} onLogin={()=>setAuthOpen(true)} onSubscriptionChange={()=>setSubscriptionVersion(v=>v+1)} onSaved={account=>{setUser(account);setAuthor({id:account.id,name:account.name});refreshContent();}} onShare={async id=>{try{await navigator.clipboard.writeText(location.origin+'/#writer-'+id);setMessage('프로필 링크를 복사했어요.');}catch{setMessage('프로필 링크를 복사하지 못했습니다.');}}}>{content}{currentFeed.posts.length<currentFeed.total&&<button className="pill load-more" disabled={currentFeed.loading} onClick={()=>setRequestPage(currentFeed.page+1)}>포스트 더 보기</button>}</WriterPage>:content}
      {view!=='author' && browsing.includes(view) && currentFeed.posts.length < currentFeed.total && <button className="pill load-more" disabled={currentFeed.loading} onClick={() => { setRequestPage(currentFeed.page + 1); if (currentFeed.error) setVersion(v => v + 1); }}>{currentFeed.loading ? '불러오는 중…' : '포스트 더 보기'}</button>}
    </AppShell>
    <SettingsDialog onDeleted={accountDeleted} onRoleChanged={refreshAuth} section={settings} onClose={()=>setSettings(null)} user={user} onLogin={()=>setAuthOpen(true)}/>
    {signup&&<SignupDialog key={signup.provider} signup={signup} onComplete={account=>{setSignup(null);setUser(account);setAuthOpen(false);signedIn(account);refreshContent();}} onCancel={()=>{setSignup(null);closeAuthDialog();setMessage('가입을 취소했습니다.');}}/>}
    <AuthDialog onLegal={()=>{setAuthOpen(false);setSettings('legal');}} open={authOpen&&!signup} onOAuthStart={rememberLoginReturn} onClose={closeAuthDialog} user={user} checking={authChecking} connectionError={authError} refresh={refreshAuth} initialError={initialAuthError}/>

    <div className="toast" role="status" hidden={!message}>{message}</div>
  </>;
}
