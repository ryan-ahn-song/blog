import { assetUrl } from './assets.js';
import CommunitySidebar from './CommunitySidebar';
import MoreMenu from './MoreMenu';
import {viewPath} from '../../../shared/paths';
export default function AppShell({authChecking,authError,onAuthRetry,view,title,query,category,onSearch,onAction,searchRef,surfaceRef,chips,children,user,onProfile,sidebarRefresh,onLogin,onSettings,onLogout,loggingOut,onAdmin,reading,reader,onBack}) {
return <div onClick={onAction}>
  <a className="skip" href={reading?'#article-reader':'#feed'} onClick={event=>{event.preventDefault();const target=document.getElementById(reading?'article-reader':'feed');target?.focus({preventScroll:true});target?.scrollIntoView();}}>{reading?'본문으로 건너뛰기':'최신 포스트로 건너뛰기'}</a>
  <aside className="rail" aria-label="사이드 메뉴">
    <a className="rail-logo" href="/home" data-view="home" aria-label="21st ARK 홈"><img src={assetUrl('logo_alone_light-1.svg')} alt="21st ARK" /></a>
    <nav aria-label="주요 메뉴">
      <a href={viewPath('home')} className={`rail-button ${view === 'home' ? 'active' : ''}`} data-view="home" aria-current={view === 'home' ? 'page' : undefined} aria-label="홈" title="홈"><svg viewBox="0 0 24 24"><path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z"/></svg></a>
      <a href={viewPath('search')} className={`rail-button ${view === 'search' ? 'active' : ''}`} data-view="search" aria-current={view === 'search' ? 'page' : undefined} aria-label="검색" title="검색"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg></a>
      <a href={viewPath('writers')} className={`rail-button ${view === 'writers' ? 'active' : ''}`} data-view="writers" aria-current={view === 'writers' ? 'page' : undefined} aria-label="필자" title="필자"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v2"/></svg></a>
      <a href={viewPath('saved')} className={`rail-button ${view === 'saved' ? 'active' : ''}`} data-view="saved" aria-current={view === 'saved' ? 'page' : undefined} aria-label="저장한 포스트" title="저장한 포스트"><svg viewBox="0 0 24 24"><path d="M6 3h12v19l-6-4-6 4Z"/></svg></a>
      {user&&['author','admin'].includes(user.role)&&<>
        <hr className="rail-divider"/>
        <div className="rail-account-nav" role="group" aria-label="개인 메뉴">
          {['author','admin'].includes(user.role)&&<>
            <a href={viewPath('write')} className={`rail-button ${view==='write'?'active':''}`} data-view="write" aria-current={view==='write'?'page':undefined} aria-label="포스트 작성" title="포스트 작성"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l4.5-1 12-12a2.1 2.1 0 0 0-3-3l-12 12L4 20Z"/></svg></a>
            <a href={viewPath('my-posts')} className={`rail-button ${view==='my-posts'?'active':''}`} data-view="my-posts" aria-current={view==='my-posts'?'page':undefined} aria-label="내 포스트 관리" title="내 포스트 관리"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 7v13a2 2 0 0 0 2 2h12M10 8h6m-6 4h6m-6 4h4"/></svg></a>
          </>}
        </div>
      </>}
    </nav>
    <MoreMenu authChecking={authChecking} user={user} onSettings={onSettings} onLogin={onLogin} onAdmin={onAdmin} onLogout={onLogout} loggingOut={loggingOut}/>
    <button className={`rail-button rail-profile ${user?'signed-in':''}`} onClick={!user&&authError?onAuthRetry:onProfile} disabled={authChecking&&!user} aria-busy={authChecking&&!user} aria-label={user?'내 프로필':authChecking?'로그인 상태 확인 중':authError?'로그인 상태 다시 확인':'로그인'} title={user?user.name:authChecking?'로그인 상태 확인 중':authError?'로그인 상태 다시 확인':'로그인'}>{user?<span>{user.avatar_url?<img src={user.avatar_url} alt=""/>:Array.from(user.name)[0]}</span>:<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>}</button>
  </aside>
  <main className={`surface ${!reading&&view === "search" ? "exploring" : ""} ${!reading&&['write','my-posts','admin'].includes(view) ? 'workspace' : ''} ${!reading&&view === 'author' ? 'author-view' : ''} ${!reading&&view === 'write' ? 'writing-workspace' : ''} ${reading?'reading-view':''}`} id="main" ref={surfaceRef}>
    <div className="layout">
      <header className="page-header">{reading?<div className="reader-page-heading"><button className="reader-back" aria-label="이전 화면으로 돌아가기" title="뒤로 가기" onClick={onBack}>←</button></div>:<h1 id="page-title">{title}</h1>}<div className="top-actions"><a href={viewPath('search')} className="pill" data-view="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>포스트 검색</a>{user && ['author','admin'].includes(user.role) && <a href={viewPath('my-posts')} className="pill" data-view="my-posts">나의 포스트</a>}{user&&['author','admin'].includes(user.role)&&<a href={viewPath('write')} className="pill primary" data-view="write">포스트 작성</a>}</div></header>
      {reading&&<section id="article-reader" tabIndex={-1} aria-label="포스트 읽기">{reader}</section>}
      <section className="search-panel" hidden={reading||view !== "search"} aria-label="검색 및 주제 탐색"><div className="explore-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><label className="sr-only" htmlFor="search">필자 또는 주제 검색</label><input type="search" id="search" placeholder="필자 또는 주제 검색" autoComplete="off" value={query} onChange={onSearch} ref={searchRef}/><button id="clear-search" aria-label="검색어 지우기" hidden={!query}>×</button></div><div className="explore-chips" role="group" aria-label="주제 선택">{chips}</div></section>
      <div className="content-columns" hidden={reading}>
        <section id="feed" tabIndex={-1} aria-label="최신 포스트 피드" aria-live="polite">{children}</section>
        {!reading&&['home','search','saved','subscriptions','writers'].includes(view)&&<CommunitySidebar authChecking={authChecking} view={view} user={user} refreshKey={sidebarRefresh} onLogin={onLogin}/>}
      </div>
    </div>
  </main>
</div>;
}
