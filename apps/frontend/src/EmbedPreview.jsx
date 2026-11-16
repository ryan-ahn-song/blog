import './embed-preview.css';
import { useEffect, useState } from 'react';
import { describeEmbed } from '../../../shared/embeds';
export function EmbedPreview({url,title='',display='link'}){
  const description=describeEmbed(url),[loaded,setLoaded]=useState(false);
  useEffect(()=>setLoaded(false),[description?.embedSrc]);
  if(!description)return <div className="embed-empty">링크를 입력해 주세요.</div>;
  const name=title.trim()||(display==='video'&&description.kind==='video'?description.provider+' 영상':description.host);
  if(display!=='video'||description.kind!=='video')return <a className="embed-link-card" href={description.url} target="_blank" rel="noopener noreferrer"><span className="embed-link-symbol" aria-hidden="true">↗</span><span className="embed-link-copy"><strong>{name}</strong><span>{description.url}</span><small>{description.host}</small></span><span className="embed-link-arrow" aria-hidden="true">↗</span></a>;
  return <div className="embed-video-card"><div className="embed-video-screen">{loaded?<iframe src={description.embedSrc} title={name} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen/>:<button type="button" className="embed-video-load" onClick={()=>setLoaded(true)}><span className="embed-play" aria-hidden="true">▶</span><strong>{name}</strong><span>영상 불러오기</span><small>{description.provider}에 연결합니다.</small></button>}</div><div className="embed-video-caption"><span>{title.trim()||description.provider}</span><a href={description.url} target="_blank" rel="noopener noreferrer">원본 보기 ↗</a></div></div>;
}

