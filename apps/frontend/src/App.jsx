import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AppShell from './AppShell';
import FeedAd from './FeedAd';
import AuthDialog from './AuthDialog';
import SignupDialog from './SignupDialog';
import SettingsDialog from './SettingsDialog';
import MyPosts from './MyPosts';
import ArticlePage from './ArticlePage';
const Editor=lazy(()=>import('./Editor'));
let readQueue=Promise.resolve();
import AdminPanel from './AdminPanel';
import WriterPage from './WriterPage';
import UsernameSetup from './UsernameSetup';
import {pageRoute,writerPath,postPath,viewPath,viewUrl} from '../../../shared/paths';
import {setPageMetadata} from './page-metadata';
import { PostCard, WriterList, EmptyState, Explore, topicName } from './ContentViews';
import { api, jsonRequest, setApiScope, clearApiCache } from './api';
import {restoreAccount} from './auth-state';

const oauthErrors = { state: '로그인 요청이 만료되었습니다. 다시 시작해 주세요.', cancelled: '로그인을 취소했습니다.', google: 'Google 로그인에 실패했습니다. 다시 시도해 주세요.', github: 'GitHub 로그인에 실패했습니다. 다시 시도해 주세요.', github_email: 'GitHub에서 기본 이메일 인증을 마친 뒤 다시 로그인해 주세요.', existing: '이미 가입된 이메일입니다. 기존에 연결한 서비스로 로그인한 후, 계정 및 설정에서 다른 로그인 계정을 연결해 주세요.', link: '현재 계정과 인증된 기본 이메일이 같은 계정을 선택해 주세요.', disabled: '이용이 중지된 계정입니다. 관리자에게 문의해 주세요.' };
const emptyFeed = { key: '', posts: [], total: 0, page: 0, loading: true, error: '' };
const browsing = ['home', 'search', 'saved', 'author', 'subscriptions'];
const restrictedViews=['write','my-posts','admin'];
function announceAuthChange(){try{localStorage.setItem('ark-auth-change',Date.now()+':'+Math.random());}catch{}}
function menuState(view,search){const p=new URLSearchParams(search);return {query:view==='search'?(p.get('q')??'').slice(0,100):'',category:['home','search'].includes(view)&&['tech','life'].includes(p.get('category'))?p.get('category'):'all',topicId:view==='search'&&/^[\w-]{1,100}$/.test(p.get('topic')??'')?p.get('topic'):'all',editId:view==='write'&&/^[\w-]{1,100}$/.test(p.get('post')??'')?p.get('post'):null};}

export default function App() {
  const params = new URLSearchParams(location.search);
  const initialRoute=useRef(pageRoute(location.pathname,location.hash)).current,initialView=initialRoute.type==='view'?initialRoute.view:initialRoute.type==='writer'?'author':'home',initialMenu=menuState(initialView,location.search);
  const [signup,setSignup]=useState(null),[routeError,setRouteError]=useState('');
  const routeRequest=useRef(0);
  const [initialAuthError] = useState(() => oauthErrors[params.get('auth_error')]);
  const loginReturn = useRef(params.get('auth') === 'success');
  const [user, setUser] = useState(null), [authOpen, setAuthOpen] = useState(Boolean(initialAuthError)), [authChecking, setAuthChecking] = useState(true), [authError, setAuthError] = useState(false);
  const [view, setView] = useState(initialView), [query, setQuery] = useState(initialMenu.query), [category, setCategory] = useState(initialMenu.category), [author, setAuthor] = useState(null), [topicId, setTopicId] = useState(initialMenu.topicId);
  const [editing, setEditing] = useState(null), [dirty, setDirty] = useState(false), [version, setVersion] = useState(0), [requestPage, setRequestPage] = useState(0);
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  const [editId,setEditId]=useState(initialMenu.editId),[editLoading,setEditLoading]=useState(false),[editError,setEditError]=useState('');
  const feedCache=useRef(new Map());
  const [feed, setFeed] = useState(emptyFeed), [topics, setTopics] = useState([]), [writers, setWriters] = useState([]), [writerTotal, setWriterTotal] = useState(0), [writerPage, setWriterPage] = useState(0);
  const [topicsError,setTopicsError]=useState('');
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
  const criteria = JSON.stringify({ kind:view==='author'?(writerFilters.kind??'post'):undefined, bookmarked: view === 'saved' ? '1' : undefined, subscribed:view==='subscriptions'?'1':undefined, q: view === 'search' ? query.trim() : undefined, category, author: author?.id, topic: view === 'search' ? topicId : undefined,writer_category:view==='author'?writerFilters.category??undefined:undefined,writer_tag:view==='author'?writerFilters.tag??undefined:undefined });
  const feedKey = criteria + ':' + (user?.id ?? 'anonymous')+':'+version+':'+subscriptionVersion+':'+taxonomyVersion;
  const currentFeed = feed.key === feedKey ? feed : feedCache.current.get(feedKey)??{ ...emptyFeed, key: feedKey };
  const title = author ? author.name || '필자 프로필' : category !== 'all' ? topicName(topics, category) : { author:'필자 프로필',home: '홈', search: '검색', writers: '필자', saved: '저장한 포스트', subscriptions:'구독한 포스트', write: '포스트 작성', 'my-posts': '내 포스트 관리', admin: '멤버 관리' }[view];
  useEffect(()=>{setPageMetadata({article,author,view,routeError});},[article,author,view,routeError]);
  const refreshContent = () => { clearApiCache();feedCache.current.clear(); setRequestPage(0); setVersion(v => v + 1); };

  function signedIn(account) {
    setApiScope(account.id+':'+account.role+':'+account.version);
    announceAuthChange();
    try{sessionStorage.removeItem('ark-auth-return-post');sessionStorage.removeItem('ark-auth-return-page');}catch{}
    routeRequest.current++;clearArticle();articleReturn.current=null;readerFocus.current=null;readerScroll.current=0;
    setEditing(null);setDirty(false);setEditId(null);setEditError('');setEditLoading(false);setRouteError('');
    setView('home');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');setWriterFilters({category:null,tag:null});setRequestPage(0);
    history.replaceState(null,'',viewPath('home'));lastRoute.current=location.href;
    setMessage('로그인했습니다. 반가워요!');
  }
  function closeAuthDialog(){setAuthOpen(false);try{sessionStorage.removeItem('ark-auth-return-post');sessionStorage.removeItem('ark-auth-return-page');}catch{}}
  const authRequest=useRef(0),authController=useRef(null),lastAuthCheck=useRef(0);
  async function refreshAuth() {
    const sequence=++authRequest.current;
    authController.current?.abort();const controller=new AbortController();authController.current=controller;lastAuthCheck.current=Date.now();
    setAuthChecking(true); setAuthError(false);
    try { const body = await restoreAccount(controller.signal); if(sequence!==authRequest.current)return; setApiScope(body.user?body.user.id+':'+body.user.role+':'+body.user.version:'anonymous'); setUser(body.user); if(params.get('auth')==='reauth'&&body.user)setSettings('account'); setSignup(body.signup??null); if(body.signup)setAuthOpen(false); else if(params.get('auth')==='signup'&&!body.user){setAuthOpen(true);setMessage('가입 인증이 만료되었습니다. 소셜 로그인을 다시 시작해 주세요.');} if (loginReturn.current && body.user) { loginReturn.current = false; signedIn(body.user); }return body.user; }
    catch { if(sequence===authRequest.current&&!controller.signal.aborted)setAuthError(true); } finally { if(sequence===authRequest.current)setAuthChecking(false);if(authController.current===controller)authController.current=null; }
  }
  useEffect(()=>{let refreshing=false;const expired=()=>{if(refreshing)return;refreshing=true;refreshAuth().then(account=>{if(account===null){setAuthOpen(true);setMessage('로그인이 만료되었습니다. 다시 로그인해 주세요.');}}).finally(()=>{refreshing=false;});};window.addEventListener('ark-auth-expired',expired);return()=>window.removeEventListener('ark-auth-expired',expired);},[]);
  useEffect(() => {
    refreshAuth();
    if (params.has('auth') || params.has('auth_error')) { const url = new URL(location.href); url.searchParams.delete('auth'); url.searchParams.delete('auth_error'); history.replaceState(null, '', url.href); }
    return()=>{authRequest.current++;authController.current?.abort();};
  }, []);
  useEffect(()=>{
    const resume=event=>{if(document.visibilityState==='hidden'||navigator.onLine===false||authController.current)return;if(event?.type==='online'||Date.now()-lastAuthCheck.current>=300000)refreshAuth();};
    const changed=event=>{if(event.key==='ark-auth-change')refreshAuth();};
    window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    window.addEventListener('storage',changed);
    const timer=setInterval(()=>{if(user)resume();},6*3600000);
    return()=>{window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('storage',changed);clearInterval(timer);};
  },[user?.id]);
  useEffect(() => {
    const controller=new AbortController();setTopicsError('');
    api('/api/topics',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setTopics(result.topics);}).catch(error=>{if(!controller.signal.aborted&&error.name!=='AbortError')setTopicsError(error.message);});
    return()=>controller.abort();
  },[version]);
  useEffect(()=>{
    if(authChecking||view!=='writers'||articleId)return;
    const controller=new AbortController();setCatalogLoading(!writers.length);setCatalogError('');
    api('/api/writers',{signal:controller.signal}).then(people=>{if(!controller.signal.aborted){setWriters(people.writers);setWriterTotal(people.total);setWriterPage(0);}}).catch(error=>{if(!controller.signal.aborted)setCatalogError(error.message);}).finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
    return()=>controller.abort();
  },[view,version,articleId,authChecking]);
  useEffect(() => {
    if (authChecking||articleId||(view==='author'&&!author)||!browsing.includes(view) || (['saved','subscriptions'].includes(view) && !user)) return;
    const controller = new AbortController();
    setFeed(previous => ({ ...(previous.key === feedKey ? previous : feedCache.current.get(feedKey)??emptyFeed), key: feedKey, loading: true, error: '' }));
    const timer = setTimeout(() => {
      const filters = Object.entries(JSON.parse(criteria)).filter(([, value]) => value !== undefined);
      api('/api/posts?' + new URLSearchParams([...filters, ['page', String(requestPage)]]), { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        setFeed(previous => ({ key: feedKey, posts: requestPage && previous.key === feedKey ? [...new Map([...previous.posts, ...result.posts].map(p => [p.id, p])).values()] : result.posts, total: result.total, page: result.page, loading: false, error: '' }));
      }).catch(e => { if (!controller.signal.aborted) setFeed(previous => ({ ...previous, loading: false, error: e.message })); });
    }, view === 'search' ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [view, criteria, feedKey, requestPage, version, subscriptionVersion, taxonomyVersion,authChecking,articleId]);
  useEffect(()=>{if(feed.key&&!feed.loading&&!feed.error){feedCache.current.set(feed.key,feed);while(feedCache.current.size>12)feedCache.current.delete(feedCache.current.keys().next().value);}},[feed]);
  useEffect(() => {
    if (authChecking||view !== 'search') return;
    const controller = new AbortController(); setSearchWriters({ writers: [], loading: true, error: '' });
    const timer = setTimeout(() => api('/api/writers?' + new URLSearchParams({ q: query.trim(), topic: topicId }), { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setSearchWriters({ writers: result.writers, loading: false, error: '' });
    }).catch(e => { if (!controller.signal.aborted) setSearchWriters({ writers: [], loading: false, error: e.message }); }), 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [view, query, topicId, version,authChecking]);
  useEffect(() => { document.title = (articleId?(article?.title??'포스트 읽기'):title) + ' | 21st ARK'; }, [title,articleId,article?.title]);
  useEffect(() => { if (view === 'search'&&!articleId) searchRef.current?.focus({ preventScroll: true }); }, [view,articleId]);
  useLayoutEffect(()=>{
    if(readerScroll.current===null||(!articleId&&browsing.includes(view)&&currentFeed.loading))return;
    surfaceRef.current?.scrollTo({top:readerScroll.current,behavior:'instant'});readerScroll.current=null;
    if(!articleId&&readerFocus.current?.isConnected){readerFocus.current.focus({preventScroll:true});readerFocus.current=null;}
  },[articleId,view,feedKey,currentFeed.loading]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if(authChecking)return;
    if(articleIdRef.current)openArticle(articleIdRef.current,false,true);
  }, [user?.id,user?.role,authChecking]);
  useEffect(()=>{
    if(authChecking||!canWrite||view!=='write'||!editId||editing?.id===editId)return;
    const controller=new AbortController();setEditLoading(true);setEditError('');
    api('/api/posts/'+editId,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setEditLoading(false);setEditing(result.post);}}).catch(error=>{if(!controller.signal.aborted){setEditError(error.message);setEditLoading(false);}});
    return()=>controller.abort();
  },[view,editId,user?.id,canWrite,authChecking,version,editing?.id]);
  useEffect(() => {
    let first=true;
    const readRoute=async(event)=>{
      if(lastRoute.current===location.href&&!first)return;
      if(event&&dirtyRef.current&&!window.confirm('저장하지 않은 변경 사항이 있습니다. 이동할까요?')){history.pushState(null,'',lastRoute.current);return;}
      const snapshot=first?null:history.state?.arkBrowse;first=false;lastRoute.current=location.href;
      const sequence=++routeRequest.current,route=pageRoute(location.pathname,location.hash);
      setRouteError('');setDirty(false);
      if(route.type==='post'){if(snapshot){articleReturn.current=snapshot;restoreBrowse(snapshot);}openArticle(route.id,false);return;}
      clearArticle();setEditing(null);setEditError('');setEditLoading(false);
      if(route.type==='writer'){
        setEditId(null);setView('author');setCategory('all');setQuery('');setTopicId('all');setWriterFilters({category:null,tag:null});setRequestPage(0);readerScroll.current=0;
        if(route.id){setAuthor({id:route.id,name:''});return;}
        setAuthor(null);
        try{const result=await api('/api/writers/by-name/'+encodeURIComponent(route.username));if(sequence===routeRequest.current)setAuthor(result.writer);}
        catch(e){if(sequence===routeRequest.current)setRouteError(e.status===404?'필자 프로필을 찾을 수 없습니다.':'필자 프로필을 불러오지 못했습니다.');}
        return;
      }
      if(route.type==='missing'){setAuthor(null);setEditId(null);setView('home');setRouteError('페이지를 찾을 수 없습니다.');return;}
      const values=menuState(route.view,location.search);
      if(snapshot?.view===route.view&&snapshot.query===values.query&&snapshot.category===values.category&&snapshot.topicId===values.topicId)restoreBrowse(snapshot);
      else{setView(route.view);setAuthor(null);setWriterFilters({category:null,tag:null});setCategory(values.category);setQuery(values.query);setTopicId(values.topicId);setRequestPage(0);readerScroll.current=0;}
      setEditId(values.editId);
    };
    readRoute();window.addEventListener('hashchange',readRoute);window.addEventListener('popstate',readRoute);
    return()=>{window.removeEventListener('hashchange',readRoute);window.removeEventListener('popstate',readRoute);};
  }, []);
  useEffect(()=>{
    if(articleId||routeError||view==='author')return;
    const route=pageRoute(location.pathname,location.hash);if(route.type!=='view'||route.view!==view)return;
    const path=viewUrl(view,{query,category,topicId,editId});
    if(location.pathname+location.search+location.hash!==path){history.replaceState(history.state,'',path);lastRoute.current=location.href;}
  },[view,query,category,topicId,editId,articleId,routeError]);

  const writerLoaded = useCallback(writer=>{setAuthor(previous=>previous?.id===writer.id?{...previous,...writer}:previous);if(!articleIdRef.current){history.replaceState(history.state,'',writerPath(writer)+location.search);lastRoute.current=location.href;}},[]);
  function profileUpdated(account){
    setApiScope(account.id+':'+account.role+':'+account.version);setUser(account);
    setAuthor(previous=>previous?.id===account.id?{...previous,name:account.name,username:account.username}:previous);
    refreshContent();
    if(articleIdRef.current)openArticle(articleIdRef.current,false,true);
  }
  const markDirty = useCallback(value => setDirty(value), []);
  function navigate(next,path=viewPath(next)) {
    if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 이동할까요?')) return false;
    if (['write', 'my-posts'].includes(next) && !canWrite) { setAuthOpen(true); return false; }
    if (next === 'admin' && user?.role !== 'admin') return false;
    setEditing(null);setEditId(null);setEditError('');setEditLoading(false);
    if(location.pathname+location.search+location.hash!==path)history.pushState(null,'',path);
    routeRequest.current++;setRouteError('');
    clearArticle();lastRoute.current=location.href;
    setWriterFilters({category:null,tag:null});setDirty(false); setView(next); setCategory('all'); setAuthor(null); setQuery(''); setTopicId('all'); setRequestPage(0);
    surfaceRef.current?.scrollTo({ top: 0, behavior: 'instant' }); return true;
  }
  function openWriter(id,name='',username) {
    const writer={id,name,username:username||(user?.id===id?user.username:undefined)};
    if(!navigate('author',writerPath(writer)))return;setAuthor(writer);
  }
  function editPost(post) {
    if (!navigate('write',viewUrl('write',{editId:post.id}))) return;
    setEditId(post.id);if(typeof post.body==='string')setEditing(post);
  }
  function savedPost(post) { setEditId(null);history.replaceState(null,'',viewPath('my-posts'));lastRoute.current=location.href;setEditing(null);setDirty(false);setView('my-posts');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');setMessage(post.status === 'published' ? '포스트를 업로드했습니다.' : '임시저장했습니다.');refreshContent();openArticle(post.id,true,false,{view:'my-posts',category:'all',author:null,query:'',topicId:'all',requestPage:0,writerFilters:{category:null,tag:null},scrollTop:0}); }
  async function logout(){
    if(loggingOut)return;
    if(dirty&&!window.confirm('저장하지 않은 변경 사항이 있습니다. 로그아웃할까요?'))return;
    authRequest.current++;authController.current?.abort();setAuthChecking(false);routeRequest.current++;setLoggingOut(true);
    try{await api('/api/auth/logout',jsonRequest('POST',{}));clearDraftBackups(user?.id);announceAuthChange();setApiScope('anonymous');feedCache.current.clear();setAuthChecking(false);setUser(null);setDirty(false);setEditing(null);setEditId(null);setSettings(null);setAuthOpen(false);setView('home');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');clearArticle();history.replaceState(null,'',viewPath('home'));lastRoute.current=location.href;refreshContent();setMessage('로그아웃했습니다.');}
    catch(e){setMessage(e.message);}finally{setLoggingOut(false);}
  }
  function clearDraftBackups(id){try{for(const key of Object.keys(localStorage))if(key.startsWith('ark-draft:'+id+':'))localStorage.removeItem(key);}catch{}}
  function accountDeleted(id){announceAuthChange();authRequest.current++;authController.current?.abort();routeRequest.current++;setApiScope('anonymous');feedCache.current.clear();
    try{for(const key of Object.keys(localStorage))if(key.startsWith('ark-draft:'+id+':'))localStorage.removeItem(key);sessionStorage.removeItem('ark-auth-return-post');}catch{}
    setAuthChecking(false);setUser(null);setSignup(null);setDirty(false);setEditing(null);setEditId(null);setSettings(null);setAuthOpen(false);setView('home');setAuthor(null);setCategory('all');setQuery('');setTopicId('all');clearArticle();history.replaceState(null,'',viewPath('home'));lastRoute.current=location.href;refreshContent();setMessage('계정을 삭제했습니다.');
  }
  function restoreBrowse(snapshot){
    setView(snapshot.view??'home');setCategory(snapshot.category??'all');setAuthor(snapshot.author??null);setQuery(snapshot.query??'');setTopicId(snapshot.topicId??'all');setRequestPage(snapshot.requestPage??0);setWriterFilters(snapshot.writerFilters??{category:null,tag:null});readerScroll.current=snapshot.scrollTop??0;
  }
  async function openArticle(id,updateHash=true,refresh=false,returnTo=null){
    routeRequest.current++;setRouteError('');
    const same=articleIdRef.current===id;
    if(updateHash&&!same){
      const snapshot=returnTo??(articleIdRef.current?articleReturn.current:{view,category,author,query,topicId,requestPage,writerFilters,scrollTop:surfaceRef.current?.scrollTop??0});
      articleReturn.current=snapshot;readerFocus.current=document.activeElement;
      if(!articleIdRef.current)history.replaceState({...history.state,arkBrowse:snapshot},'',location.href);
      const known=currentFeed.posts.find(post=>post.id===id);const path=known?postPath(known):'/'+(author?.username?encodeURIComponent(author.username):'post')+'/posts/'+id;history.pushState({arkArticle:true,arkBrowse:snapshot},'',path);lastRoute.current=location.href;
    }
    articleIdRef.current=id;setArticleId(id);setArticleError('');setArticleLoading(true);if(!same||refresh)setArticle(null);if(!refresh)readerScroll.current=0;
    const request=++articleRequest.current;
    try{const result=await api('/api/posts/'+id);if(request!==articleRequest.current)return;setArticle(result.post);history.replaceState(history.state,'',postPath(result.post));lastRoute.current=location.href;
      if(!refresh&&result.post.status==='published'&&activeUserId.current){const actor=activeUserId.current;readQueue=readQueue.catch(()=>{}).then(()=>activeUserId.current===actor?api('/api/reading-history',jsonRequest('POST',{post_id:id})):null).catch(()=>{});}
      if(!refresh&&result.post.status==='published'&&navigator.doNotTrack!=='1'&&!navigator.globalPrivacyControl){readQueue=readQueue.catch(()=>{}).then(()=>api('/api/posts/'+id+'/view',jsonRequest('POST',{}))).catch(()=>{});}
    }catch(e){if(request===articleRequest.current){setArticle(null);setArticleError(e.message);}}
    finally{if(request===articleRequest.current)setArticleLoading(false);}
  }
  function clearArticle(){articleRequest.current++;articleIdRef.current=null;setArticleId(null);setArticle(null);setArticleLoading(false);setArticleError('');}
  function returnFromArticle(){
    if(history.state?.arkArticle&&history.state?.arkBrowse){history.back();return;}
    if(article?.writer)openWriter(article.writer.id,article.writer.name,article.writer.username);else navigate('home');
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
      for(const [key,value] of feedCache.current)feedCache.current.set(key,{...value,posts:value.posts.map(p=>p.id===id?{...p,...result.post}:p)});
      setFeed(previous => ({ ...previous, posts: previous.posts.map(p => p.id === id ? { ...p, ...result.post } : p) }));
      setArticle(previous => previous?.id === id ? { ...previous, ...result.post } : previous);
      if (kind === 'bookmark') { setMessage(result.post.saved ? '저장한 포스트에 담았어요.' : '저장한 포스트에서 삭제했어요.'); if (view === 'saved' && !result.post.saved) refreshContent(); }
    } catch (e) { setMessage(e.message); if (e.status === 401) refreshAuth(); }
    finally { reactionRequests.current.delete(id);setPending(values => { const next = new Set(values); next.delete(id); return next; }); }
  }
  async function onAction(event) {
    if(event.target.closest('.feed-ad'))return;
    const button = event.target.closest('button,a[data-post],a[data-author],a[data-view]'); if (!button) return;
    if(button.tagName==='A'){if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();}
    const d = button.dataset;
    if (d.view) navigate(d.view);
    if (d.exploreTopic) { if(view==='search'){setTopicId(d.exploreTopic);setRequestPage(0);}else if(navigate('search'))setTopicId(d.exploreTopic); }
    if (d.author) openWriter(d.author,d.authorName,d.username);
    if (d.category) { const next = category === d.category ? 'all' : d.category; if (navigate('home')) setCategory(next); }
    if (d.post) openArticle(d.post);
    if (d.like) reactToPost(d.like, 'like');
    if (d.save) reactToPost(d.save, 'bookmark');
    if (d.share) { const post=article?.id===d.share?article:currentFeed.posts.find(post=>post.id===d.share);if(!post)return;const url=new URL(postPath(post),location.origin); try { await navigator.clipboard.writeText(url.href); setMessage('포스트 링크를 복사했어요.'); } catch { setMessage('이 브라우저에서는 링크를 복사할 수 없어요.'); } }
    if (button.id === 'clear-search') { setQuery(''); setRequestPage(0); searchRef.current?.focus(); }
  }
  async function moreWriters() { try { const result = await api('/api/writers?page=' + (writerPage + 1)); setWriters(previous => [...new Map([...previous, ...result.writers].map(w => [w.id, w])).values()]); setWriterPage(result.page); setWriterTotal(result.total); } catch (e) { setMessage(e.message); } }
  const chips = [{ id: 'all', name: '전체' }, ...topics].map(t => <button key={t.id} data-explore-topic={t.id} aria-pressed={t.id === topicId} className={t.id === topicId ? 'selected' : ''}>{t.name}</button>);


  let content;
  if(routeError)content=<EmptyState title={routeError} action="홈으로" onAction={()=>navigate('home')}/>;
  else if(view==='author'&&!author)content=<p role="status">필자 프로필을 불러오고 있어요.</p>;
  else if(authError&&!user&&[...restrictedViews,'saved','subscriptions'].includes(view))content=<EmptyState title="로그인 상태를 확인하지 못했습니다." action="다시 확인" onAction={refreshAuth}>연결 상태를 확인한 뒤 다시 시도해 주세요.</EmptyState>;
  else if(restrictedViews.includes(view)&&authChecking&&!user)content=<p role="status">로그인 상태를 확인하고 있어요.</p>;
  else if(restrictedViews.includes(view)&&(!canWrite||(view==='admin'&&user?.role!=='admin')))content=<EmptyState title={!user?'로그인이 필요합니다.':view==='admin'?'관리자만 볼 수 있는 페이지입니다.':'작성자 권한이 필요합니다.'} action={!user?'로그인':undefined} onAction={()=>setAuthOpen(true)}/>;
  else if(view==='write'&&canWrite&&editId&&(editLoading||editing?.id!==editId))content=editError?<EmptyState title={editError} action="다시 시도" onAction={()=>setVersion(value=>value+1)}/>:<p role="status">편집할 포스트를 불러오고 있어요.</p>;
  else if (view === 'write' && canWrite) content = <Suspense fallback={<p role="status">포스트 작성 화면을 불러오고 있어요.</p>}><Editor key={user.id + ':' + (editing?.id || 'new')} user={user} post={editing} topics={topics} onSaved={savedPost} onDirty={markDirty}/></Suspense>;
  else if (view === 'my-posts' && canWrite) content = <MyPosts user={user} onEdit={editPost} refreshKey={version} onChanged={refreshContent}/>;
  else if (view === 'admin' && user?.role === 'admin') content = <AdminPanel user={user} onChanged={refreshContent}/>;

  else if (view === 'writers') content = catalogLoading ? <p role="status">필자를 불러오고 있어요.</p> : catalogError ? null : writers.length ? <><WriterList writers={writers}/>{writers.length < writerTotal && <button className="pill load-more" onClick={moreWriters}>필자 더 보기</button>}</> : <EmptyState title="아직 등록된 필자가 없어요."/>;
  else if (['saved','subscriptions'].includes(view) && !user) content = authChecking ? <p role="status">로그인 상태를 확인하고 있어요.</p> : <EmptyState title={view==='subscriptions'?'구독한 필자의 새 포스트를 모아 보세요.':'저장한 포스트를 계정에서 모아 보세요.'} action="로그인" onAction={() => setAuthOpen(true)}>로그인하면 다른 기기에서도 이어서 볼 수 있어요.</EmptyState>;
  else if (view === 'search') content = <Explore topics={topics} writers={searchWriters.writers} writersLoading={searchWriters.loading} writersError={searchWriters.error} posts={currentFeed.posts} total={currentFeed.total} query={query} topicId={topicId} loading={currentFeed.loading} error={currentFeed.error}/>;
  else if (currentFeed.loading && !currentFeed.posts.length) content = <p className="content-loading" role="status">포스트를 불러오고 있어요.</p>;
  else if (currentFeed.posts.length) content = currentFeed.posts.flatMap((p, i) => [<PostCard key={p.id} post={p} topics={topics} first={i === 0} pending={pending}/>,...(view==='home'&&(i+1)%7===0?[<FeedAd key={'ad-after-'+p.id} after={i+1} enabled={!articleId&&!settings&&!authOpen&&!signup&&!user?.needs_username}/>]:[])]);
  else if (!currentFeed.error) content = <EmptyState title={view==='author'&&writerFilters.kind==='notice'?'아직 업로드된 공지가 없어요.':view==='subscriptions'?'구독한 필자의 새 포스트가 없어요.':view === 'saved' ? '아직 저장한 포스트가 없어요.' : author || category !== 'all' ? '아직 업로드된 포스트가 없어요.' : '아직 업로드된 포스트가 없어요.'} action={!['saved','subscriptions'].includes(view) && !(view==='author'&&writerFilters.kind==='notice') && canStartPost ? '첫 포스트 작성' : undefined} onAction={() => navigate('write')}>{view==='subscriptions'?<>필자 페이지에서 구독하면 새 포스트를 이곳에서 볼 수 있어요. <button className="text-button" data-view="writers">필자 둘러보기</button></>:view==='author'&&writerFilters.kind==='notice'?(canStartPost?'상단의 포스트 작성에서 게시 종류를 공지로 선택해 보세요.':'새로운 공지가 올라오면 이곳에서 읽을 수 있어요.'):view === 'saved' ? '포스트 아래의 책갈피를 눌러 모아 보세요.' : canStartPost ? '첫 번째 포스트를 작성해 보세요.' : '새로운 포스트가 올라오면 이곳에서 읽을 수 있어요.'}</EmptyState>;

  return <>
    <AppShell authChecking={authChecking} authError={authError} onAuthRetry={refreshAuth} reading={Boolean(articleId)} onBack={returnFromArticle} reader={<ArticlePage post={article} loading={articleLoading} error={articleError} topics={topics} user={user} pending={pending} onRetry={()=>openArticle(articleId,false)} onEdit={editPost} onLogin={()=>{setAuthOpen(true);refreshAuth();}}/>} view={view} title={title} query={query} category={category} onSearch={e => { setQuery(e.target.value); setRequestPage(0); }} onAction={onAction} searchRef={searchRef} surfaceRef={surfaceRef} chips={chips} onSettings={setSettings} onLogout={logout} loggingOut={loggingOut} onAdmin={()=>navigate('admin')} sidebarRefresh={version+':'+subscriptionVersion} onLogin={()=>setAuthOpen(true)} user={user} onProfile={() => { if(user)openWriter(user.id,user.name);else{setAuthOpen(true);refreshAuth();} }}>
      {topicsError && ['write','search'].includes(view) && <p className="auth-error" role="alert">분류 정보를 불러오지 못했습니다. <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {view==='writers'&&catalogError&&<p className="auth-error" role="alert">필자를 불러오지 못했습니다. <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {browsing.includes(view) && currentFeed.error && <p className="auth-error" role="alert">{currentFeed.error} <button className="text-button" onClick={refreshContent}>다시 시도</button></p>}
      {view==='author'&&author&&!routeError?<WriterPage key={author.id} id={author.id} user={user} version={version} taxonomyVersion={taxonomyVersion} filters={writerFilters} onFilter={(kind,id)=>{setWriterFilters(previous=>kind==='kind'?{category:null,tag:null,kind:id}:kind==='clear'?{category:null,tag:null,kind:previous.kind??'post'}:{...previous,[kind]:previous[kind]===id?null:id});setRequestPage(0);}} onTaxonomyChanged={()=>{setTaxonomyVersion(value=>value+1);setWriterFilters({category:null,tag:null});setRequestPage(0);}} onLoaded={writerLoaded} onLogin={()=>setAuthOpen(true)} onSubscriptionChange={()=>setSubscriptionVersion(v=>v+1)} onSaved={profileUpdated} onShare={async writer=>{try{await navigator.clipboard.writeText(new URL(writerPath(writer),location.origin).href);setMessage('프로필 링크를 복사했어요.');}catch{setMessage('프로필 링크를 복사하지 못했습니다.');}}}>{content}{currentFeed.posts.length<currentFeed.total&&<button className="pill load-more" disabled={currentFeed.loading} onClick={()=>setRequestPage(currentFeed.page+1)}>포스트 더 보기</button>}</WriterPage>:content}
      {view!=='author' && browsing.includes(view) && currentFeed.posts.length < currentFeed.total && <button className="pill load-more" disabled={currentFeed.loading} onClick={() => { setRequestPage(currentFeed.page + 1); if (currentFeed.error) setVersion(v => v + 1); }}>{currentFeed.loading ? '불러오는 중…' : '포스트 더 보기'}</button>}
    </AppShell>
    <SettingsDialog onNavigate={setSettings} onProfileUpdated={profileUpdated} onDeleted={accountDeleted} onRoleChanged={refreshAuth} section={settings} onClose={()=>setSettings(null)} user={user} onLogin={()=>setAuthOpen(true)}/>
    {signup&&<SignupDialog key={signup.provider} signup={signup} onComplete={account=>{setSignup(null);setUser(account);setAuthOpen(false);signedIn(account);refreshContent();}} onCancel={()=>{setSignup(null);closeAuthDialog();setMessage('가입을 취소했습니다.');}}/>}
    {user?.needs_username&&!signup&&<UsernameSetup key={user.id} user={user} onLogout={logout} onSaved={profileUpdated}/>}
    <AuthDialog onLegal={()=>{setAuthOpen(false);setSettings('legal');}} open={authOpen&&!signup} onClose={closeAuthDialog} user={user} checking={authChecking} connectionError={authError} refresh={refreshAuth} initialError={initialAuthError}/>

    <div className="toast" role="status" hidden={!message}>{message}</div>
  </>;
}
