import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
const vite=await createServer({root:fileURLToPath(new URL('../apps/frontend',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
const modulePath=relative=>'/@fs/'+fileURLToPath(new URL(relative,import.meta.url)).replaceAll('\\','/');
try{
  const {safeEmbedUrl,describeEmbed}=await vite.ssrLoadModule(modulePath('../shared/embeds.ts'));
  const {EmbedPreview}=await vite.ssrLoadModule('/src/EmbedBlock.jsx');
  const {documentFields}=await vite.ssrLoadModule(modulePath('../apps/backend/src/document.ts'));
  const sample='M7lc1UVf-VE';
  for(const bad of ['javascript:alert(1)','data:text/html,unsafe','file:///etc/passwd','mailto:a@example.com','https://user:password@example.com','https://exa mple.com','https://example.com/'+ 'a'.repeat(2048)])assert.equal(safeEmbedUrl(bad),null,bad.slice(0,40));
  for(const url of ['https://youtu.be/'+sample,'https://youtube.com/watch?v='+sample,'https://www.youtube.com/shorts/'+sample,'https://m.youtube.com/live/'+sample,'https://www.youtube-nocookie.com/embed/'+sample])assert.equal(describeEmbed(url).embedSrc.split('?')[0],'https://www.youtube-nocookie.com/embed/'+sample);
  assert.match(describeEmbed('https://youtu.be/'+sample+'?t=1m30s').embedSrc,/start=90/);
  for(const url of ['https://youtube.com.evil.invalid/watch?v='+sample,'https://youtube.com:9999/watch?v='+sample,'https://youtu.be/invalid-id'])assert.equal(describeEmbed(url).kind,'link');
  assert.equal(describeEmbed('https://vimeo.com/76979871').embedSrc,'https://player.vimeo.com/video/76979871?dnt=1');assert.match(describeEmbed('https://vimeo.com/76979871/abcdef1234').embedSrc,/h=abcdef1234/);
  const normal=renderToString(createElement(EmbedPreview,{url:'https://youtu.be/'+sample,title:'평범한 링크'}));assert.ok(normal.includes('<a '));assert.ok(!normal.includes('영상 불러오기'));assert.ok(!normal.includes('<iframe'));
  const video=renderToString(createElement(EmbedPreview,{url:'https://youtu.be/'+sample,title:'선택한 영상',display:'video'}));assert.ok(video.includes('영상 불러오기'));assert.ok(!video.includes('<iframe'),'External players only load after an explicit click');
  const escaped=renderToString(createElement(EmbedPreview,{url:'https://example.com',title:'<script>alert(1)</script>'}));assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('&lt;script&gt;'));
  const doc=[{id:'video',type:'linkEmbed',props:{href:'https://youtu.be/'+sample,title:'설명',display:'video'},children:[]},{id:'link',type:'linkEmbed',props:{href:'https://youtu.be/'+sample,title:'링크로만 첨부',display:'link'},children:[]}];
  assert.deepEqual(JSON.parse(documentFields({body_format:'markdown',body_doc:doc}).document),doc);
  for(const props of [{href:'javascript:alert(1)'},{href:'https://example.com',display:'video'},{href:'https://example.com',display:'iframe'},{href:'https://example.com',src:'https://evil.invalid'},{href:'https://example.com',title:'x'.repeat(161)}])assert.throws(()=>documentFields({body_format:'markdown',body_doc:[{type:'linkEmbed',props}]}));
  console.log('Embeds passed: URL/provider validation, spoofed hosts and credentials, explicit video choice, link-only YouTube cards, no player request before click, escaped titles and structured document validation.');
}finally{await vite.close();}
