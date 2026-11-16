import { EmbedPreview } from './EmbedPreview';
export { EmbedPreview } from './EmbedPreview';
import { markdownToHTML } from '@blocknote/core';
import { useEffect, useState } from 'react';
import { createReactBlockSpec, useEditorState } from '@blocknote/react';
import { describeEmbed, safeEmbedUrl } from '../../../shared/embeds';


function LinkEmbed({block,editor}){
  const editable=useEditorState({editor,selector:({editor})=>editor?.isEditable??false});
  const [editing,setEditing]=useState(!block.props.href),[url,setUrl]=useState(block.props.href),[title,setTitle]=useState(block.props.title),[error,setError]=useState('');
  function apply(event){
    event.preventDefault();event.stopPropagation();
    const href=safeEmbedUrl(url);
    if(!href){setError('http 또는 https 링크를 입력해 주세요.');return;}
    if(block.props.display==='video'&&describeEmbed(href)?.kind!=='video'){setError('YouTube 또는 Vimeo 영상 링크를 입력해 주세요.');return;}
    editor.updateBlock(block.id,{props:{href,title:title.trim()}});setEditing(false);setError('');
    const position=editor.document.findIndex(item=>item.id===block.id);
    if(position===editor.document.length-1)editor.insertBlocks([{type:'paragraph'}],block.id,'after');
    editor.focus();
  }
  function cancel(){
    if(!block.props.href)editor.updateBlock(block.id,{type:'paragraph',props:{},content:[]});
    setEditing(false);setError('');editor.focus();
  }
  return <div className="link-embed-block" contentEditable={false}>
    {editable&&editing?<form className="embed-form" onSubmit={apply} onKeyDown={event=>event.stopPropagation()} onPaste={event=>event.stopPropagation()}><label htmlFor={'embed-url-'+block.id}>{block.props.display==='video'?'임베드할 영상 링크':'임베드할 링크'}</label><input id={'embed-url-'+block.id} type="url" placeholder={block.props.display==='video'?'https://… · YouTube 또는 Vimeo 영상':'https://… · 링크 카드로 표시할 주소'} required maxLength={2048} value={url} onChange={event=>setUrl(event.target.value)} autoFocus/><label htmlFor={'embed-title-'+block.id}>제목 <small>선택</small></label><input id={'embed-title-'+block.id} maxLength={160} placeholder="링크를 설명하는 제목" value={title} onChange={event=>setTitle(event.target.value)}/>{error&&<p role="alert">{error}</p>}<div><button type="button" onClick={cancel}>취소</button><button type="submit">링크 추가</button></div></form>:<><EmbedPreview url={block.props.href} title={block.props.title} display={block.props.display}/>{editable&&<button type="button" className="embed-edit" aria-label="임베드 링크 수정" onClick={()=>{setUrl(block.props.href);setTitle(block.props.title);setEditing(true);setError('');}}>링크 수정</button>}</>}
  </div>;
}

export const createLinkEmbed=createReactBlockSpec({type:'linkEmbed',propSchema:{href:{default:''},title:{default:''},display:{default:'link',values:['link','video']}},content:'none'},{
  render:LinkEmbed,
  toExternalHTML:({block})=>{const url=safeEmbedUrl(block.props.href);return <figure data-ark-embed="true" data-embed-url={url??''} data-embed-title={block.props.title} data-embed-display={block.props.display}>{url&&<a href={url}>{block.props.title||url}</a>}</figure>;},
  parse:element=>{
    if(!element.hasAttribute('data-ark-embed'))return;
    const href=safeEmbedUrl(element.getAttribute('data-embed-url')),display=element.getAttribute('data-embed-display')==='video'?'video':'link';
    if(href&&(display!=='video'||describeEmbed(href)?.kind==='video'))return {href,title:(element.getAttribute('data-embed-title')??'').slice(0,160),display};
  },
});

export function parseEmbedMarkdown(editor,markdown){
  if(!markdown.trim())return [{type:'paragraph'}];
  const document=new DOMParser().parseFromString(markdownToHTML(markdown),'text/html');
  for(const paragraph of document.querySelectorAll('p')){
    const nodes=[...paragraph.childNodes].filter(node=>node.nodeType!==3||node.textContent.trim());
    if(nodes.length!==1||nodes[0].nodeName!=='A')continue;
    const anchor=nodes[0],marker=anchor.getAttribute('title');
    if(!['영상 임베드','링크 카드'].includes(marker))continue;
    const href=safeEmbedUrl(anchor.getAttribute('href')),display=marker==='영상 임베드'?'video':'link';
    if(!href||(display==='video'&&describeEmbed(href)?.kind!=='video'))continue;
    const figure=document.createElement('figure'),title=anchor.textContent===href?'':anchor.textContent.slice(0,160);
    for(const [key,value] of Object.entries({'data-ark-embed':'true','data-embed-url':href,'data-embed-title':title,'data-embed-display':display}))figure.setAttribute(key,value);
    figure.append(anchor.cloneNode(true));paragraph.replaceWith(figure);
  }
  return editor.tryParseHTMLToBlocks(document.body.innerHTML);
}
export function serializeEmbedMarkdown(editor,blocks=editor.document){
  const replacements=new Map();
  const transform=items=>items.map(block=>{
    const children=block.children?.length?transform(block.children):[];
    if(block.type!=='linkEmbed')return {...block,children};
    const token='ARKEMBED'+crypto.randomUUID().replaceAll('-',''),href=safeEmbedUrl(block.props.href);
    const label=(block.props.title||href||'').replace(/\s+/g,' ').replace(/[\\[\]]/g,'\\$&');
    replacements.set(token,href?'['+label+'](<'+href+'> "'+(block.props.display==='video'?'영상 임베드':'링크 카드')+'")':'');
    return {id:block.id,type:'paragraph',content:token,children};
  });
  let markdown=editor.blocksToMarkdownLossy(transform(blocks));
  for(const [token,value] of replacements)markdown=markdown.replaceAll(token,value);
  return markdown;
}
