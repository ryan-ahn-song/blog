import {useEffect,useRef,useState} from 'react';
import {api,jsonRequest} from './api';

export default function PostPinButton({post,user,onChanged}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const identity=user?.id+':'+post.id,active=useRef(identity);active.current=identity;
  useEffect(()=>{setError('');},[identity]);
  if(user?.role!=='admin'||post.status!=='published'||post.kind==='notice')return null;
  async function toggle(){
    if(pending)return;const owner=identity;setPending(true);setError('');
    try{const result=await api('/api/posts/'+post.id+'/pin',jsonRequest('PUT',{active:!post.pinned}));if(active.current===owner)onChanged?.(result.post);}
    catch(e){if(active.current===owner)setError(e.message);}
    finally{setPending(false);}
  }
  return <span className="post-pin-control"><button className="pill post-pin-button" aria-label={post.title+(post.pinned?' 고정 해제':' 고정')} aria-pressed={Boolean(post.pinned)} disabled={pending} title="트렌딩 맨 위에 표시합니다. 최대 3개까지 고정할 수 있어요." onClick={toggle}>{pending?'처리 중…':post.pinned?'고정 해제':'포스트 고정'}</button>{error&&<span className="post-pin-error" role="alert">{error}</span>}</span>;
}
