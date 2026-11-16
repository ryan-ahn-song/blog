import {useEffect,useId,useRef,useState} from 'react';
import {api,jsonRequest} from './api';

function useTaxonomy(writerId,scope,version){
  const [state,setState]=useState({data:null,loading:true,error:''}),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setState(previous=>({...previous,loading:true,error:''}));
    api('/api/writers/'+writerId+'/taxonomy'+(scope==='manage'?'?scope=manage':''),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({data,loading:false,error:''});}).catch(error=>{if(!controller.signal.aborted)setState({data:null,loading:false,error:error.message});});
    return()=>controller.abort();
  },[writerId,scope,version,retry]);
  return {...state,data:state.data?.writer_id===writerId?state.data:null,reload:()=>setRetry(value=>value+1)};
}

export function WriterTaxonomyFields({writerId,canManage,value,onChange,disabled,onBusy}){
  const catalog=useTaxonomy(writerId,'manage'),[tagName,setTagName]=useState(''),[categoryName,setCategoryName]=useState(''),[adding,setAdding]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
  const dataListId=useId(),tags=value.writer_tag_ids??[],category=value.writer_category_id??null;
  const currentTags=(value.writer_tags??[]).filter(tag=>tags.includes(tag.id));
  const availableTags=[...new Map([...currentTags,...(catalog.data?.tags??[])].map(tag=>[tag.id,tag])).values()];
  async function create(kind,name){
    const normalized=name.normalize('NFKC').trim().replace(/\s+/g,' ').replace(kind==='tag'?/^#+/:/^$/,'').trim();if(!normalized)return;
    if(kind==='tag'&&tags.length>=10){setError('태그는 포스트마다 10개까지 추가할 수 있어요.');return;}
    const list=kind==='tag'?catalog.data?.tags:catalog.data?.categories,existing=list?.find(label=>label.name.toLocaleLowerCase()===normalized.toLocaleLowerCase());
    if(!existing&&!canManage){setError('이 필자가 만든 분류와 태그만 선택할 수 있어요.');return;}
    setPending(true);onBusy(true);setError('');
    try{const label=existing??(await api('/api/writers/'+writerId+'/taxonomy',jsonRequest('POST',{kind,name:normalized}))).label;
      if(kind==='category'){onChange({writer_category_id:label.id,writer_category:label});setCategoryName('');setAdding(false);}
      else{onChange({writer_tag_ids:[...new Set([...tags,label.id])],writer_tags:[...availableTags.filter(tag=>tags.includes(tag.id)&&tag.id!==label.id),label]});setTagName('');}
      catalog.reload();
    }catch(e){setError(e.message);}finally{setPending(false);onBusy(false);}
  }
  return <div className="editor-writer-taxonomy">
    <div className="editor-field-heading"><label htmlFor={dataListId+'category'}>개인 분류</label><span>선택</span></div>
    <div className="writer-category-select"><select id={dataListId+'category'} value={category??''} disabled={disabled||pending||catalog.loading} onChange={event=>{const label=catalog.data?.categories.find(item=>item.id===event.target.value);onChange({writer_category_id:label?.id??null,writer_category:label??null});}}><option value="">분류 없음</option>{catalog.data?.categories.map(label=><option key={label.id} value={label.id}>{label.name}</option>)}</select>{canManage&&<button type="button" className="taxonomy-add-button" disabled={disabled||pending} aria-expanded={adding} onClick={()=>setAdding(value=>!value)}>새 분류</button>}</div>
    {adding&&<div className="taxonomy-inline-create"><input aria-label="새 개인 분류 이름" maxLength={40} placeholder="분류 이름" value={categoryName} onChange={event=>setCategoryName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();create('category',categoryName);}}}/><button type="button" disabled={disabled||pending||!categoryName.trim()} onClick={()=>create('category',categoryName)}>추가</button></div>}
    <div className="editor-field-heading"><label htmlFor={dataListId+'tags'}>태그</label><span>{tags.length}/10</span></div>
    {tags.length>0&&<div className="editor-tag-chips">{tags.map(id=>{const label=availableTags.find(tag=>tag.id===id);return <span key={id}>#{label?.name??'태그'}<button type="button" disabled={disabled||pending} aria-label={(label?.name??'태그')+' 태그 제거'} onClick={()=>onChange({writer_tag_ids:tags.filter(tag=>tag!==id),writer_tags:availableTags.filter(tag=>tags.includes(tag.id)&&tag.id!==id)})}>×</button></span>;})}</div>}
    <div className="taxonomy-inline-create"><input id={dataListId+'tags'} list={dataListId+'suggestions'} maxLength={30} placeholder="태그 입력 후 Enter" value={tagName} disabled={disabled||pending||catalog.loading||tags.length>=10} onChange={event=>setTagName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();create('tag',tagName);}}}/><button type="button" disabled={disabled||pending||!tagName.trim()||tags.length>=10} onClick={()=>create('tag',tagName)}>추가</button></div>
    <datalist id={dataListId+'suggestions'}>{catalog.data?.tags.filter(tag=>!tags.includes(tag.id)).map(tag=><option key={tag.id} value={tag.name}/>)}</datalist>
    {(error||catalog.error)&&<p className="taxonomy-error" role="alert">{error||catalog.error}{catalog.error&&<button type="button" onClick={catalog.reload}>다시 시도</button>}</p>}
  </div>;
}

export function WriterTaxonomySidebar({writerId,user,total,version,filters,onFilter,onChanged}){
  const catalog=useTaxonomy(writerId,'public',version),[managing,setManaging]=useState(false);
  const own=user?.id===writerId&&['author','admin'].includes(user.role);
  const data=catalog.data;
  return <aside className="writer-taxonomy-sidebar" aria-label="필자의 분류와 태그">
    <section><div className="writer-taxonomy-heading"><h3>개인 분류</h3>{own&&<button onClick={()=>setManaging(true)}>관리</button>}</div>
      <button className="writer-category-row" aria-pressed={!filters.category&&!filters.tag} onClick={()=>onFilter('clear')}><span>전체 포스트</span><small>{total}</small></button>
      {data?.categories.map(label=><button className="writer-category-row" key={label.id} aria-pressed={filters.category===label.id} onClick={()=>onFilter('category',label.id)}><span>{label.name}</span><small>{label.post_count}</small></button>)}
      {!catalog.loading&&!catalog.error&&!data?.categories.length&&<p className="taxonomy-empty">아직 분류한 포스트가 없어요.</p>}
    </section>
    <section><h3>태그</h3><div className="writer-tag-list">{data?.tags.map(label=><button key={label.id} aria-pressed={filters.tag===label.id} onClick={()=>onFilter('tag',label.id)}>#{label.name}<small>{label.post_count}</small></button>)}</div>{!catalog.loading&&!catalog.error&&!data?.tags.length&&<p className="taxonomy-empty">아직 태그가 없어요.</p>}</section>
    {catalog.loading&&<p className="taxonomy-empty" role="status">불러오는 중…</p>}{catalog.error&&<p className="taxonomy-error" role="alert">{catalog.error} <button onClick={catalog.reload}>다시 시도</button></p>}
    {own&&<TaxonomyManager writerId={writerId} open={managing} onClose={()=>setManaging(false)} version={version} onChanged={onChanged}/>}
  </aside>;
}

function TaxonomyManager({writerId,open,onClose,version,onChanged}){
  const dialog=useRef(null),catalog=useTaxonomy(writerId,open?'manage':'public',version),[kind,setKind]=useState('category'),[name,setName]=useState(''),[editing,setEditing]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();else if(!open&&dialog.current.open)dialog.current.close();if(open){setName('');setEditing(null);setError('');}},[open]);
  async function save(event){event.preventDefault();if(pending||!name.trim())return;setPending(true);setError('');try{await api('/api/writers/'+writerId+'/taxonomy'+(editing?'/'+editing:''),jsonRequest(editing?'PATCH':'POST',{kind,name}));setName('');setEditing(null);onChanged();catalog.reload();}catch(e){setError(e.message);}finally{setPending(false);}}
  async function remove(label){if(pending||!window.confirm('“'+label.name+'” '+(kind==='category'?'분류를':'태그를')+' 삭제할까요? 포스트는 유지되고 이 항목만 포스트에서 해제됩니다.'))return;setPending(true);setError('');try{await api('/api/writers/'+writerId+'/taxonomy/'+label.id,{method:'DELETE'});if(editing===label.id){setEditing(null);setName('');}onChanged();catalog.reload();}catch(e){setError(e.message);}finally{setPending(false);}}
  const labels=kind==='category'?catalog.data?.categories:catalog.data?.tags;
  return <dialog className="auth-dialog taxonomy-manager" ref={dialog} aria-labelledby="taxonomy-manager-title" onCancel={event=>{if(pending)event.preventDefault();else onClose();}} onClose={onClose}>
    <button className="auth-close" aria-label="분류 관리 닫기" disabled={pending} onClick={onClose}>×</button><h2 id="taxonomy-manager-title">분류와 태그 관리</h2><p className="settings-note">내 포스트에서 사용할 분류와 태그를 관리하세요.</p>
    <div className="taxonomy-kind-tabs">{[['category','개인 분류'],['tag','태그']].map(([value,label])=><button key={value} aria-pressed={kind===value} disabled={pending} onClick={()=>{setKind(value);setEditing(null);setName('');setError('');}}>{label}</button>)}</div>
    <form onSubmit={save} className="taxonomy-manager-form"><label htmlFor="taxonomy-label-name">{editing?'이름 변경':kind==='category'?'새 분류':'새 태그'}</label><div><input id="taxonomy-label-name" value={name} maxLength={kind==='category'?40:30} required disabled={pending} onChange={event=>setName(event.target.value)}/><button className="pill" disabled={pending||!name.trim()}>{editing?'저장':'추가'}</button>{editing&&<button type="button" className="text-button" onClick={()=>{setEditing(null);setName('');}}>취소</button>}</div></form>
    {error&&<p className="auth-error" role="alert">{error}</p>}{catalog.error&&<p className="auth-error" role="alert">{catalog.error}</p>}
    <div className="taxonomy-management-list">{labels?.map(label=><div key={label.id}><span>{kind==='tag'?'#':''}{label.name}<small>업로드한 포스트 {label.post_count}개</small></span><button disabled={pending} aria-label={label.name+' 이름 변경'} onClick={()=>{setEditing(label.id);setName(label.name);}}>이름 변경</button><button className="taxonomy-delete" disabled={pending} aria-label={label.name+' 삭제'} onClick={()=>remove(label)}>삭제</button></div>)}</div>
    {!catalog.loading&&!labels?.length&&<p className="taxonomy-empty">아직 만든 {kind==='category'?'분류가':'태그가'} 없어요.</p>}
  </dialog>;
}
