import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { ko } from '@blocknote/core/locales';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import './block-editor.css';

const supported=['paragraph','heading','bulletListItem','numberedListItem','checkListItem','toggleListItem','quote','codeBlock','table','divider','image'];
const schema=BlockNoteSchema.create({blockSpecs:Object.fromEntries(Object.entries(defaultBlockSpecs).filter(([type])=>supported.includes(type)))});
const dictionary={...ko,placeholders:{...ko.placeholders,default:"글을 쓰거나 '/'를 눌러 블록을 추가하세요",emptyDocument:"글을 쓰거나 '/'를 눌러 블록을 추가하세요"}};
const initialBlocks=value=>Array.isArray(value.body_doc)&&value.body_doc.length?value.body_doc:(value.body||'').split(/\n{2,}/).map(text=>({type:'paragraph',content:text}));

export default forwardRef(function BlockCanvas({initialValue,onChange,uploadFile,disabled,title,bodyLength=0},ref){
  const [mode,setMode]=useState('blocks'),[source,setSource]=useState(initialValue.body||''),[error,setError]=useState(''),[imagePending,setImagePending]=useState(false);
  const sourceDirty=useRef(false),silent=useRef(false),importInput=useRef(null),imageInput=useRef(null),imageTarget=useRef(null);
  const editor=useCreateBlockNote({schema,dictionary,initialContent:initialBlocks(initialValue),uploadFile});
  const previousDocument=useRef({json:JSON.stringify(editor.document),empty:!editor.blocksToMarkdownLossy(editor.document).trim()});
  useEffect(()=>{if(initialValue.body_format==='markdown'&&!initialValue.body_doc){silent.current=true;try{const blocks=editor.tryParseMarkdownToBlocks(initialValue.body||'');editor.replaceBlocks(editor.document,blocks.length?blocks:[{type:'paragraph'}]);previousDocument.current={json:JSON.stringify(editor.document),empty:!editor.blocksToMarkdownLossy(editor.document).trim()};}finally{silent.current=false;}}},[editor]);
  function snapshot(){
    if(sourceDirty.current){
      silent.current=true;
      try{const blocks=editor.tryParseMarkdownToBlocks(source);editor.replaceBlocks(editor.document,blocks.length?blocks:[{type:'paragraph'}]);sourceDirty.current=false;}
      finally{silent.current=false;}
      return {body:source,body_doc:editor.document,body_format:'markdown'};
    }
    return {body:editor.blocksToMarkdownLossy(editor.document),body_doc:editor.document,body_format:'markdown'};
  }
  useImperativeHandle(ref,()=>({snapshot}),[editor,source]);
  function switchMode(next){
    setError('');
    try{
      if(next==='markdown'&&mode!=='markdown'){setSource(editor.blocksToMarkdownLossy(editor.document));sourceDirty.current=false;}
      else if(sourceDirty.current){const value=snapshot();onChange(value);}
      setMode(next);
    }catch{setError('마크다운을 변환하지 못했습니다. 내용을 확인해 주세요.');}
  }
  function changed(){
    if(silent.current)return;
    const body=editor.blocksToMarkdownLossy(editor.document),current={json:JSON.stringify(editor.document),empty:!body.trim()},previous=previousDocument.current;
    previousDocument.current=current;
    if(current.json===previous.json||(current.empty&&previous.empty))return;
    onChange({body,body_doc:editor.document,body_format:'markdown'});
  }
  function download(){
    const value=snapshot();const markdown=value.body.replace(/\(\/api\/media\/(posts\/[\w-]+\/[\w-]+\.(?:jpg|png|webp))\)/g,(_,key)=>'('+location.origin+'/api/media/'+key+')');
    const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=(title?.trim()||'새로운 글').replace(/[<>:"/\\|?*]/g,'-')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function chooseImages(){
    setError('');
    try{if(mode==='markdown'){const value=snapshot();onChange(value);}imageTarget.current=editor.getTextCursorPosition().block.id;imageInput.current.click();}
    catch{setError('이미지를 넣을 위치를 선택해 주세요.');}
  }
  async function insertImages(event){
    const files=Array.from(event.target.files??[]);event.target.value='';if(!files.length)return;
    setError('');
    if(files.length>10){setError('이미지는 한 번에 10개까지 추가할 수 있어요.');return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)){setError('JPG, PNG, WebP 이미지를 각각 8MB 이하로 선택해 주세요.');return;}
    setImagePending(true);
    try{
      const results=await Promise.allSettled(files.map(async file=>({type:'image',props:{url:await uploadFile(file),name:file.name,caption:''}})));
      const blocks=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
      if(blocks.length){
        const target=editor.getBlock(imageTarget.current)??editor.document.at(-1);
        const empty=target?.type==='paragraph'&&!blockTextLength(target)&&!target.children?.length;
        const inserted=empty?editor.replaceBlocks([target],[...blocks,{type:'paragraph'}]).insertedBlocks:editor.insertBlocks([...blocks,{type:'paragraph'}],target,'after');
        sourceDirty.current=false;setMode('blocks');editor.setTextCursorPosition(inserted.at(-1).id,'start');editor.focus();
      }
      const failure=results.find(result=>result.status==='rejected');
      if(failure)setError(failure.reason?.message||'일부 이미지를 업로드하지 못했습니다. 다시 추가해 주세요.');
    }catch(e){setError(e.message||'이미지를 추가하지 못했습니다. 다시 시도해 주세요.');}finally{setImagePending(false);}
  }
  async function importMarkdown(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');
    if(file.size>320000){setError('마크다운 파일은 320KB 이하로 선택해 주세요.');return;}
    if((editor.blocksToMarkdownLossy(editor.document).trim()||source.trim())&&!window.confirm('현재 본문을 선택한 마크다운 파일로 바꿀까요?'))return;
    try{const text=await file.text();if(text.length>80000)throw new Error('본문은 80,000자 이내로 작성해 주세요.');silent.current=true;const blocks=editor.tryParseMarkdownToBlocks(text);editor.replaceBlocks(editor.document,blocks.length?blocks:[{type:'paragraph'}]);sourceDirty.current=false;setSource(text);onChange({body:text,body_doc:editor.document,body_format:'markdown'});}
    catch(e){setError(e.message||'마크다운 파일을 불러오지 못했습니다.');}finally{silent.current=false;}
  }
  return <section className="document-editor" aria-label="본문 편집">
    <div className="document-toolbar"><div className="document-mode-controls"><div className="segmented" role="group" aria-label="본문 편집 방식">{[['blocks','블록'],['markdown','마크다운'],['preview','미리보기']].map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} disabled={disabled||imagePending} onClick={()=>switchMode(value)}>{label}</button>)}</div><span className="editor-body-count">본문 {bodyLength.toLocaleString()} / 80,000자</span></div><div className="document-tools"><button className="insert-image-button" type="button" aria-label="본문에 이미지 추가" disabled={disabled||imagePending||mode==='preview'} onMouseDown={event=>event.preventDefault()} onClick={chooseImages}>{imagePending?'업로드 중…':'＋ 이미지 추가'}</button><button type="button" title="마크다운 파일 불러오기" aria-label="마크다운 파일 불러오기" disabled={disabled||imagePending} onClick={()=>importInput.current.click()}>불러오기</button><button type="button" title="글 다운로드" aria-label="글 다운로드" disabled={disabled||imagePending} onClick={download}>글 다운로드</button><input ref={importInput} className="sr-only" type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={importMarkdown} tabIndex={-1}/><input ref={imageInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="본문 이미지 파일" onChange={insertImages} tabIndex={-1}/></div></div>
    {imagePending&&<p className="document-upload-status" role="status">이미지를 업로드하고 있어요. 완료되면 본문에 추가됩니다.</p>}
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <div className="document-page">
      <div className="document-mode-label"><span>{mode==='preview'?'미리보기':mode==='markdown'?'MARKDOWN':'본문'}</span>{mode==='blocks'&&<span>드래그로 블록 이동 · / 로 블록 추가</span>}</div>
      <div hidden={mode==='markdown'} className={mode==='preview'?'block-canvas document-preview':'block-canvas'}><BlockNoteView editor={editor} theme="dark" editable={!disabled&&mode==='blocks'} onChange={changed} formattingToolbar={mode==='blocks'} sideMenu={mode==='blocks'} slashMenu={mode==='blocks'} linkToolbar={mode==='blocks'} filePanel={mode==='blocks'}/></div>
      {mode==='markdown'&&<textarea className="markdown-source" aria-label="마크다운 본문" spellCheck={false} placeholder={'# 제목\n\n여기에 마크다운을 작성하세요.'} value={source} disabled={disabled} onChange={event=>{const body=event.target.value;setSource(body);sourceDirty.current=true;onChange({body,body_doc:null,body_format:'markdown'});}}/>}
    </div>
    <div className="document-shortcuts"><span><kbd>Enter</kbd> 새 블록</span><span><kbd>Shift ↵</kbd> 줄바꿈</span><span><kbd>#</kbd> 제목</span><span><kbd>[ ]</kbd> 할 일</span><span><kbd>⌘ / Ctrl B</kbd> 굵게</span></div>
  </section>;
});

function blockTextLength(block){
  const length=value=>typeof value==='string'?value.length:Array.isArray(value)?value.reduce((total,item)=>total+length(item?.text??item?.content??item),0):0;
  return length(block.content??[]);
}

export function BlockReader({post}){
  const editor=useCreateBlockNote({schema,dictionary,initialContent:initialBlocks(post)});
  useEffect(()=>{if(!post.body_doc){const blocks=editor.tryParseMarkdownToBlocks(post.body);editor.replaceBlocks(editor.document,blocks.length?blocks:[{type:'paragraph'}]);}},[editor]);
  return <div className="block-document"><BlockNoteView editor={editor} theme="dark" editable={false} formattingToolbar={false} sideMenu={false} slashMenu={false} linkToolbar={false} filePanel={false}/></div>;
}
