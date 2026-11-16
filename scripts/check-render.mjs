import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
globalThis.location = { hash: '' };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true });
const vite = await createServer({ root: fileURLToPath(new URL('../apps/frontend', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
  const html = renderToString(createElement(App));
  assert.equal((html.match(/class="post"/g) || []).length, 0);
  assert.ok(html.includes('글을 불러오고 있어요.'));
  assert.ok(!html.includes('좋은 코드는 읽는 사람을 생각한다'));
  assert.ok(!html.includes('프론트엔드 · 취향 수집가'));
  assert.ok(html.includes('21st ARK'));assert.ok(!html.includes('article-dialog'),'Articles no longer render in a modal');
  assert.ok(html.includes('logo_alone_light-1.svg'));
  const {PostCard,WriterList}=await vite.ssrLoadModule('/src/ContentViews.jsx');
  const fixture={id:'real-id',writer:{id:'writer-id',name:'DB 작성자'},title:'D1에서 가져온 글',summary:'실제 소개',body:'실제 본문',published_at:1794614400,category:'tech',like_count:42,liked:true,saved:true};
  const card=renderToString(createElement(PostCard,{post:fixture,topics:[{id:'tech',name:'개발 · 기술'}],pending:new Set()}));
  assert.ok(card.includes('DB 작성자'));assert.ok(card.includes('D1에서 가져온 글'));assert.ok(card.includes('>42<'));assert.ok(card.includes('aria-pressed="true"'));assert.ok(!card.includes('code-art'));
  const people=renderToString(createElement(WriterList,{writers:[{id:'writer-id',name:'DB 작성자',bio:'저장된 소개',post_count:3}]}));
  assert.ok(people.includes('저장된 소개'));assert.ok(people.replace(/<!--.*?-->/g,'').includes('업로드한 글 3개'));
  const {default:AppShell}=await vite.ssrLoadModule('/src/AppShell.jsx');
  for(const role of [null,'reader','author','admin']){
    const shell=renderToString(createElement(AppShell,{view:'home',title:'홈',query:'',onSearch:()=>{},category:'all',people:[],popularTopics:[],user:role?{name:'메뉴 확인',role}:null}));
    assert.ok(!shell.includes('data-view="admin"'),'No member-management shortcut in the page header');
    assert.ok(!shell.includes('<footer'),'No sidebar footer');assert.ok(shell.includes('트랜딩'));assert.ok(shell.includes('내가 구독한 필자'));
    const nav=shell.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.equal(nav.includes('data-view="profile"'),false);
    assert.equal(nav.includes('rail-divider'),['author','admin'].includes(role));
    for(const view of ['write','my-posts'])assert.equal(nav.includes('data-view="'+view+'"'),['author','admin'].includes(role));
    if(['author','admin'].includes(role))assert.ok(nav.indexOf('data-view="saved"')<nav.indexOf('rail-divider'));
  }
  const {default:ArticlePage}=await vite.ssrLoadModule('/src/ArticlePage.jsx');
  const reading=createElement(ArticlePage,{post:{...fixture,status:'published',body_format:'plain'},topics:[{id:'tech',name:'개발 · 기술'}],user:{id:'viewer',name:'열람자',role:'reader'},pending:new Set()});
  const readingHtml=renderToString(reading);assert.ok(readingHtml.includes('D1에서 가져온 글'));assert.ok(readingHtml.includes('실제 본문'));assert.ok(readingHtml.includes('aria-label="글 저장"'));assert.ok(!readingHtml.includes('글 수정'),'Readers cannot edit an article');assert.ok(readingHtml.includes('댓글 등록'));assert.ok(readingHtml.includes('댓글 내용'));
  const guestReading=renderToString(createElement(ArticlePage,{post:{...fixture,status:'published',body_format:'plain'},topics:[],user:null,pending:new Set()}));assert.ok(guestReading.includes('로그인하고 댓글 남기기'));assert.ok(!guestReading.includes('댓글 등록'));
  const draftReading=renderToString(createElement(ArticlePage,{post:{...fixture,status:'draft',body_format:'plain'},topics:[],user:null,pending:new Set()}));assert.ok(!draftReading.includes('id="post-comments"'));
  const readingShell=renderToString(createElement(AppShell,{view:'search',title:'검색',query:'existing query',onSearch:()=>{},reading:true,reader:reading,user:null,children:'preserved list'}));
  assert.ok(readingShell.includes('aria-label="사이드 메뉴"'));assert.ok(readingShell.includes('id="article-reader"'));assert.ok(readingShell.includes('class="content-columns" hidden=""'));assert.ok(readingShell.includes('이전 화면으로 돌아가기'));assert.ok(!readingShell.includes('article-dialog'));
  const {default:AuthDialog}=await vite.ssrLoadModule('/src/AuthDialog.jsx');
  const loginDialog=renderToString(createElement(AuthDialog,{open:false,checking:false,user:null})).replace(/<!--.*?-->/g,'');
  assert.ok(loginDialog.includes('Google 계정으로 계속하기'));assert.ok(loginDialog.includes('GitHub 계정으로 계속하기'));assert.ok(!loginDialog.includes('기존 이메일 계정으로 로그인'));assert.ok(!loginDialog.includes('처음 로그인하면'));assert.ok(!loginDialog.includes('type="password"'));
  console.log('React render passed: no sample fallback, loading state, database article/author fields, real like counts and saved state.');
} finally { await vite.close(); }
