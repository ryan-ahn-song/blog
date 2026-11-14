export default function AppShell({view,title,query,category,onSearch,onAction,searchRef,surfaceRef,chips,people,children}) {
return <div onClick={onAction}>
  <a className="skip" href="#feed">최신 글로 건너뛰기</a>
  <aside className="rail" aria-label="사이드 메뉴">
    <a className="rail-logo" href="./" aria-label="21st ARK 홈"><img src="assets/logo_alone_light-1.svg" alt="21st ARK" /></a>
    <nav>
      <button className={`rail-button ${view === 'home' ? 'active' : ''}`} data-view="home" aria-current={view === 'home' ? 'page' : undefined} aria-label="홈" title="홈"><svg viewBox="0 0 24 24"><path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z"/></svg></button>
      <button className={`rail-button ${view === 'search' ? 'active' : ''}`} data-view="search" aria-current={view === 'search' ? 'page' : undefined} aria-label="검색" title="검색"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg></button>
      <button className={`rail-button ${view === 'writers' ? 'active' : ''}`} data-view="writers" aria-current={view === 'writers' ? 'page' : undefined} aria-label="필자" title="필자"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v2"/></svg></button>
      <button className={`rail-button ${view === 'saved' ? 'active' : ''}`} data-view="saved" aria-current={view === 'saved' ? 'page' : undefined} aria-label="저장한 글" title="저장한 글"><svg viewBox="0 0 24 24"><path d="M6 3h12v19l-6-4-6 4Z"/></svg></button>
    </nav>
    <button className="rail-button rail-bottom" data-view="settings" aria-label="화면 설정" title="화면 설정"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>
  </aside>
  <main className={`surface ${view === "search" ? "exploring" : ""}`} id="main" ref={surfaceRef}>
    <div className="layout">
      <header className="page-header"><h1 id="page-title">{title}</h1><div className="top-actions"><button className="pill" data-view="search"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg>글 검색</button><button className="pill" data-view="writers">필자 보기</button><button className="pill primary" data-view="home">모든 글</button></div></header>
      <section className="search-panel" hidden={view !== "search"} aria-label="검색 및 주제 탐색"><div className="explore-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><label className="sr-only" htmlFor="search">필자 또는 주제 검색</label><input type="search" id="search" placeholder="필자 또는 주제 검색" autoComplete="off" value={query} onChange={onSearch} ref={searchRef}/><button id="clear-search" aria-label="검색어 지우기" hidden={!query}>×</button></div><div className="explore-chips" role="group" aria-label="주제 선택">{chips}</div></section>
      <div className="content-columns">
        <section id="feed" aria-label="최신 글 피드" aria-live="polite">{children}</section>
        <aside className="right-column">
          <section className="topics"><h2>인기 관심사</h2><div className="topic-list"><button className={`pill ${category === 'tech' ? 'selected' : ''}`} data-category="tech" aria-pressed={category === 'tech'}>개발 · 기술</button><button className={`pill ${category === 'life' ? 'selected' : ''}`} data-category="life" aria-pressed={category === 'life'}>일상 · 에세이</button></div></section>
          <section className="people"><div className="aside-heading"><h2>필자</h2><button data-view="writers">모두 보기</button></div><div id="people-list">{people}</div></section>
          <footer><span>21st ARK</span><button data-view="home">모든 글</button><button data-view="saved">저장한 글</button><p>© 2026 21st ARK</p></footer>
        </aside>
      </div>
    </div>
  </main>
</div>;
}
