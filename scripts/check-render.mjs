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
  assert.equal((html.match(/class="post"/g) || []).length, 6);
  assert.ok(html.includes('좋은 코드는 읽는 사람을 생각한다'));
  assert.ok(html.includes('21st ARK'));
  assert.ok(html.includes('logo_alone_light-1.svg'));
  console.log('React render passed: 6 existing posts, brand and supplied logo.');
} finally { await vite.close(); }
