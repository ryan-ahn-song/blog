import { useEffect, useState } from 'react';
import { api, jsonRequest } from './api';
const blank = { title: '', summary: '', body: '', category: 'tech', image_key: null, image: null, status: 'draft' };
export default function Editor({ user, post, topics, onSaved, onDirty }) {
  const [record, setRecord] = useState(post);
  const storageKey = 'ark-draft:' + user.id + ':' + (post?.id || 'new');
  const [form, setForm] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved && (!post || saved.revision === post.revision)) return { ...blank, ...saved }; } catch {} return { ...blank, ...post }; });
  const [dirty, setDirty] = useState(() => { try { return Boolean(localStorage.getItem(storageKey)); } catch { return false; } }), [pending, setPending] = useState(false), [uploading, setUploading] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(false);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(form)); } catch { setNotice('브라우저에 백업하지 못했습니다. 임시저장해 주세요.'); } }, 500);
    return () => { window.removeEventListener('beforeunload', protect); clearTimeout(timer); };
  }, [form, dirty, storageKey]);
  const change = (key, value) => { setForm(f => ({ ...f, [key]: value })); setDirty(true); setNotice(''); };
  async function upload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = '';
    if (file.size > 8 * 1024 * 1024) { setError('이미지는 8MB 이하로 올려 주세요.'); return; }
    setUploading(true); setError('');
    try { const result = await api('/api/media', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }); setForm(f => ({ ...f, image_key: result.key, image: result.url })); setDirty(true); }
    catch (e) { setError(e.message); } finally { setUploading(false); }
  }
  async function save(status) {
    setPending(true); setError(''); setNotice('');
    try {
      const result = await api('/api/posts' + (record ? '/' + record.id : ''), jsonRequest(record ? 'PUT' : 'POST', { ...form, revision: record?.revision, status }));
      setRecord(result.post); setForm(result.post); setDirty(false);
      try { localStorage.removeItem(storageKey); } catch {}
      setNotice(status === 'published' ? '발행했습니다. 홈에서 글을 읽을 수 있어요.' : '임시저장했습니다. 나의 글에서 이어 쓸 수 있어요.');
      onSaved(result.post);
    } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  const disabled = pending || uploading;
  const categories=topics.filter(t=>t.id===t.category);
  const selectedTopics=form.topic_ids??[form.category];
  function changeCategory(category){setForm(f=>({...f,category,topic_ids:[category]}));setDirty(true);setNotice('');}
  function changeTopic(id,checked){change('topic_ids',checked?[...new Set([...selectedTopics,id])]:selectedTopics.filter(value=>value!==id));}
  return <section className="editor" aria-label="글 작성">
    <div className="workspace-intro"><div><p className="eyebrow">WRITE YOUR NEXT STORY</p><h2>{record ? '이야기 이어 쓰기' : '새로운 이야기'}</h2><p>생각을 적고, 준비가 되면 함께 나눠 보세요.</p></div><span className="status-tag">{record?.status === 'published' ? '발행한 글' : '초안'}</span></div>
    <div className="editor-toolbar"><div className="segmented"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>작성</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>미리보기</button></div><span className="editor-count">{form.body.length.toLocaleString()} / 80,000자</span></div>
    {preview ? <article className="editor-preview"><p className="eyebrow">{topics.find(t=>t.id===form.category)?.name}</p><h2>{form.title || '제목을 입력해 주세요'}</h2><p className="preview-summary">{form.summary}</p>{form.image && <img src={form.image} alt="대표 이미지"/>}<div className="prose">{form.body || '아직 작성한 내용이 없어요.'}</div></article> : <form id="post-editor" onSubmit={e => { e.preventDefault(); save('published'); }}>
      <fieldset disabled={disabled}>
        <label htmlFor="post-category">분류</label><select id="post-category" value={form.category} disabled={!categories.length} onChange={e=>changeCategory(e.target.value)}>{categories.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <div className="editor-topics" role="group" aria-label="세부 주제">{topics.filter(t=>t.category===form.category&&t.id!==t.category).map(t=><label key={t.id}><input type="checkbox" checked={selectedTopics.includes(t.id)} onChange={e=>changeTopic(t.id,e.target.checked)}/>{t.name}</label>)}</div>
        <label htmlFor="post-title">제목</label><input className="editor-title" id="post-title" placeholder="이야기의 제목" required maxLength={160} value={form.title} onChange={e => change('title', e.target.value)}/>
        <label htmlFor="post-summary">짧은 소개 <span>선택 · 280자 이내</span></label><textarea id="post-summary" rows={2} maxLength={280} placeholder="이 글은 어떤 이야기인가요?" value={form.summary} onChange={e => change('summary', e.target.value)}/>
        <div className="cover-label"><label htmlFor="post-cover">대표 이미지 <span>선택 · JPG, PNG, WebP · 최대 8MB</span></label>{form.image && <button type="button" className="text-button" onClick={() => { change('image_key', null); change('image', null); }}>이미지 제거</button>}</div>
        {form.image && <img className="editor-cover" src={form.image} alt="업로드한 대표 이미지"/>}<input id="post-cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload}/>
        <label htmlFor="post-body">본문</label><textarea className="editor-body" id="post-body" required maxLength={80000} placeholder="여기에서 이야기를 시작하세요. 줄바꿈은 그대로 표시됩니다." value={form.body} onChange={e => change('body', e.target.value)}/>
      </fieldset>
    </form>}
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="workspace-notice" role="status">{notice}</p>}
    <div className="editor-footer"><span>{!categories.length?'분류를 불러오는 중…':uploading ? '이미지 업로드 중…' : pending ? '저장 중…' : dirty ? '저장하지 않은 변경 사항' : record ? '저장됨' : '제목과 본문을 입력해 주세요'}</span><div><button type="button" className="pill" disabled={disabled||!categories.length} onClick={() => save('draft')}>{record?.status === 'published' ? '발행 취소 · 임시저장' : '임시저장'}</button><button type="button" className="pill primary" disabled={disabled||!categories.length} onClick={() => save('published')}>{pending ? '저장 중…' : record?.status === 'published' ? '수정 사항 발행' : '발행하기'}</button></div></div>
  </section>;
}

export function MyPosts({ onEdit, onNew, refreshKey }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(0);
  useEffect(() => { let cancelled = false; setResult(null); setError(''); api('/api/posts?mine=1&page=' + page).then(r => { if (!cancelled) setResult(r); }).catch(e => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [page, refreshKey]);
  return <section><div className="workspace-intro"><div><p className="eyebrow">YOUR STORIES</p><h2>나의 글</h2><p>초안부터 발행한 이야기까지.</p></div><button className="pill primary" onClick={onNew}>새 글 쓰기</button></div>{error && <p className="auth-error" role="alert">{error}</p>}{!result && !error && <p role="status">글을 불러오고 있어요.</p>}{result && <><div className="my-posts">{result.posts.length ? result.posts.map(p => <button className="draft-row" key={p.id} onClick={() => onEdit(p)}><span className="status-tag">{p.status === 'published' ? '발행' : '초안'}</span><span><strong>{p.title}</strong><small>{new Date(p.updated_at * 1000).toLocaleDateString('ko-KR')} 수정</small></span><span aria-hidden="true">↗</span></button>) : <div className="empty">첫 번째 이야기를 써 보세요.</div>}</div><div className="pagination"><button className="pill" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button><span>{page + 1} 페이지 · {result.total}개의 글</span><button className="pill" disabled={(page + 1) * 20 >= result.total} onClick={() => setPage(p => p + 1)}>다음</button></div></>}</section>;
}
