import { useEffect, useRef, useState } from 'react';
import { api, jsonRequest } from './api';
import BlockCanvas from './BlockCanvas';
const blank = { title: '', summary: '', body: '', body_doc: null, body_format: 'markdown', category: 'tech', image_key: null, image: null, status: 'draft' };
export default function Editor({ user, post, topics, onSaved, onDirty }) {
  const [record, setRecord] = useState(post);
  const storageKey = 'ark-draft:' + user.id + ':' + (post?.id || 'new');
  const [restored]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey));if(!saved||(post&&saved.revision!==post.revision))return null;if(!post&&!saved.title?.trim()&&!saved.summary?.trim()&&!saved.body?.trim()&&!saved.image_key&&(!saved.category||saved.category==='tech')&&(!saved.topic_ids||saved.topic_ids.every(id=>id==='tech'))){localStorage.removeItem(storageKey);return null;}return saved;}catch{return null;}});
  const [form, setForm] = useState(() => restored?{...blank,...restored,body_format:restored.body_format??'plain'}:{...blank,...post});
  const initialValue=useRef(form),canvas=useRef(null),uploadQueue=useRef(Promise.resolve());
  const [dirty, setDirty] = useState(Boolean(restored)), [pending, setPending] = useState(false), [uploads, setUploads] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(form)); } catch { setNotice('브라우저에 백업하지 못했습니다. 임시저장해 주세요.'); } }, 500);
    return () => { window.removeEventListener('beforeunload', protect); clearTimeout(timer); };
  }, [form, dirty, storageKey]);
  const change = (key, value) => { setForm(f => ({ ...f, [key]: value })); setDirty(true); setNotice(''); };
  function changeDocument(value){setForm(f=>({...f,...value}));setDirty(true);setNotice('');}
  async function uploadFile(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024) throw new Error('JPG, PNG, WebP 이미지를 8MB 이하로 선택해 주세요.');
    setUploads(n=>n+1);setError('');
    const request=uploadQueue.current.then(()=>api('/api/media',{method:'POST',headers:{'Content-Type':file.type},body:file}));
    uploadQueue.current=request.then(()=>{},()=>{});
    try{return await request;}
    finally{setUploads(n=>n-1);}
  }
  async function uploadCover(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{const result=await uploadFile(file);setForm(f=>({...f,image_key:result.key,image:result.url}));setDirty(true);setNotice('');}catch(e){setError(e.message);}
  }
  async function uploadInline(file){try{const result=await uploadFile(file);return result.source??('/api/media/'+result.key);}catch(e){setError(e.message);throw e;}}
  async function save(status) {
    setError('');setNotice('');
    let value;
    try{value={...form,...canvas.current.snapshot()};}catch{setError('본문을 변환하지 못했습니다. 마크다운 내용을 확인해 주세요.');return;}
    if(!value.title.trim()||value.title.trim().length>160){setError('제목을 160자 이내로 입력해 주세요.');document.getElementById('post-title')?.focus();return;}
    if(!value.body.trim()||value.body.length>80000){setError('본문을 80,000자 이내로 입력해 주세요.');return;}
    setPending(true);
    try {
      const result = await api('/api/posts' + (record ? '/' + record.id : ''), jsonRequest(record ? 'PUT' : 'POST', { title:value.title,summary:value.summary,body:value.body,body_doc:value.body_doc,body_format:value.body_format,category:value.category,topic_ids:value.topic_ids??[value.category],image_key:value.image_key,revision:record?.revision,status }));
      setRecord(result.post); setForm(result.post); setDirty(false);
      try { localStorage.removeItem(storageKey); } catch {}
      setNotice(status === 'published' ? '업로드했습니다. 홈에서 글을 읽을 수 있어요.' : '임시저장했습니다. 내 글 관리에서 이어 쓸 수 있어요.');
      onSaved(result.post);
    } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  const disabled=pending||uploads>0,categories=topics.filter(t=>t.id===t.category),selectedTopics=form.topic_ids??[form.category];
  function changeCategory(category){setForm(f=>({...f,category,topic_ids:[category]}));setDirty(true);setNotice('');}
  function changeTopic(id,checked){change('topic_ids',checked?[...new Set([...selectedTopics,id])]:selectedTopics.filter(value=>value!==id));}
  return <section className="editor split-editor" aria-label="글 작성">
    <aside className="editor-details" aria-label="글 설정">
      <div className="editor-details-heading"><div><h2>{record?'글 편집':'새로운 글'}</h2></div><span className="status-tag">{record?.status==='published'?'업로드한 글':'초안'}</span></div>
      <form id="post-editor" onSubmit={event=>{event.preventDefault();save('published');}}><fieldset disabled={disabled}>
        <label htmlFor="post-category">분류</label><select id="post-category" value={form.category} disabled={!categories.length} onChange={event=>changeCategory(event.target.value)}>{categories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <div className="editor-topics" role="group" aria-label="세부 주제">{topics.filter(t=>t.category===form.category&&t.id!==t.category).map(t=><label key={t.id}><input type="checkbox" checked={selectedTopics.includes(t.id)} onChange={event=>changeTopic(t.id,event.target.checked)}/>{t.name}</label>)}</div>
        <div className="editor-field-heading"><label htmlFor="post-title">제목</label><span>{form.title.length}/160</span></div><textarea className="editor-title" id="post-title" rows={2} placeholder="글의 제목" required maxLength={160} value={form.title} onChange={event=>change('title',event.target.value)}/>
        <div className="editor-field-heading"><label htmlFor="post-summary">짧은 소개</label><span>선택 · {form.summary.length}/280</span></div><textarea id="post-summary" rows={3} maxLength={280} placeholder="어떤 내용의 글인가요?" value={form.summary} onChange={event=>change('summary',event.target.value)}/>
        <div className="cover-label"><label htmlFor="post-cover">대표 이미지 <span>선택</span></label>{form.image&&<button type="button" className="text-button" onClick={()=>{change('image_key',null);change('image',null);}}>제거</button>}</div>
        {form.image&&<img className="editor-cover" src={form.image} alt="업로드한 대표 이미지"/>}<label className="cover-upload-button" htmlFor="post-cover"><span>＋ {form.image?'이미지 변경':'이미지 추가'}</span><small>JPG, PNG, WebP · 최대 8MB</small><input className="sr-only" id="post-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover}/></label>
      </fieldset></form>
      <div className="editor-save-area"><div className="editor-save-state" role="status"><span className={dirty?'unsaved-dot':'saved-dot'}/>{!categories.length?'분류를 불러오는 중…':uploads?'이미지 업로드 중…':pending?'저장 중…':dirty?'저장하지 않은 변경 사항':record?'저장됨':'작성 준비 완료'}</div><p className="editor-body-count">본문 {form.body.length.toLocaleString()} / 80,000자</p>
        {error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="workspace-notice" role="status">{notice}</p>}
        <div className="editor-save-buttons"><button type="button" className="pill" disabled={disabled||!categories.length} onClick={()=>save('draft')}>{record?.status==='published'?'업로드 취소 · 임시저장':'임시저장'}</button><button type="button" className="pill primary" disabled={disabled||!categories.length} onClick={()=>save('published')}>{pending?'저장 중…':record?.status==='published'?'수정 사항 업로드':'업로드하기'}</button></div>
      </div>
    </aside>
    <BlockCanvas ref={canvas} initialValue={initialValue.current} title={form.title} onChange={changeDocument} uploadFile={uploadInline} disabled={pending}/>
  </section>;
}
