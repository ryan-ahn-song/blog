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
  assert.ok(html.includes('21st ARK'));
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
  console.log('React render passed: no sample fallback, loading state, database article/author fields, real like counts and saved state.');
} finally { await vite.close(); }
