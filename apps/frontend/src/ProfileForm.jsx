import { useEffect, useId, useState } from 'react';
import { api, jsonRequest } from './api';
export default function ProfileForm({ user, onSaved, expanded=false, onBusy }) {
  const id=useId();
  const [name,setName]=useState(user.name),[bio,setBio]=useState(user.bio??''),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [images,setImages]=useState({avatar_key:user.avatar_key,cover_key:user.cover_key,avatar_url:user.avatar_url,cover_url:user.cover_url});
  useEffect(()=>{setName(user.name);setBio(user.bio??'');setImages({avatar_key:user.avatar_key,cover_key:user.cover_key,avatar_url:user.avatar_url,cover_url:user.cover_url});},[user.id,user.version]);
  function busy(value){setPending(value);onBusy?.(value);}
  async function upload(event,purpose){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');setNotice('');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('JPG, PNG, WebP 이미지를 8MB 이하로 선택해 주세요.');return;}
    busy(true);
    try{const result=await api('/api/media?purpose='+purpose,{method:'POST',headers:{'Content-Type':file.type},body:file});setImages(previous=>({...previous,[purpose+'_key']:result.key,[purpose+'_url']:result.url}));}
    catch(e){setError(e.message);}finally{busy(false);}
  }
  async function submit(event){event.preventDefault();busy(true);setError('');setNotice('');try{const result=await api('/api/auth/profile',jsonRequest('PATCH',{name,bio,version:user.version,avatar_key:images.avatar_key,cover_key:images.cover_key}));onSaved(result.user);setNotice('프로필을 저장했습니다.');}catch(e){setError(e.message);}finally{busy(false);}}
  const form=<form onSubmit={submit}><fieldset disabled={pending}>
    <div className="profile-media-fields">{['cover','avatar'].map(purpose=><div className={'profile-upload profile-upload--'+purpose} key={purpose}>
      <h3>{purpose==='avatar'?'프로필 사진':'커버 이미지'}</h3>
      <div className="profile-upload-preview">{images[purpose+'_url']?<img src={images[purpose+'_url']} alt={purpose==='avatar'?'프로필 사진 미리보기':'커버 미리보기'}/>:<span>{purpose==='avatar'?Array.from(name||' ')[0]:'커버 이미지'}</span>}</div>
      <p className="profile-image-size">{purpose==='avatar'?'권장 400 × 400px · 1:1 · 원형으로 표시':'권장 1500 × 500px · 3:1 · 화면에 맞게 잘릴 수 있어요.'}</p>
      <div className="profile-image-actions"><label className="pill" htmlFor={id+purpose}>{purpose==='avatar'?'프로필 사진 변경':'커버 변경'}<input className="sr-only" id={id+purpose} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>upload(e,purpose)}/></label>
      {images[purpose+'_key']&&<button type="button" className="text-button" aria-label={purpose==='avatar'?'프로필 사진 삭제':'커버 이미지 삭제'} onClick={()=>setImages(previous=>({...previous,[purpose+'_key']:null,[purpose+'_url']:null}))}>삭제</button>}</div>
    </div>)}</div><p className="profile-upload-note">JPG, PNG, WebP · 이미지당 최대 8MB. 변경 후 아래의 프로필 저장을 눌러 주세요.</p>
    <label htmlFor={id+'name'}>표시 이름</label><input id={id+'name'} required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><label htmlFor={id+'bio'}>소개 <span>선택 · 160자</span></label><textarea id={id+'bio'} rows={3} maxLength={160} value={bio} onChange={e=>setBio(e.target.value)}/>
    {error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="workspace-notice" role="status">{notice}</p>}<button className="pill primary auth-submit" disabled={pending}>{pending?'처리 중…':'프로필 저장'}</button></fieldset></form>;
  return expanded?<section className="profile-edit profile-edit-page" aria-label="프로필 수정">{form}</section>:<details className="profile-edit"><summary>프로필 수정</summary>{form}</details>;
}
