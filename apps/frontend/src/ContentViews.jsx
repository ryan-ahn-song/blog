import { useLayoutEffect, useRef, useState } from 'react';
import {writerPath,postPath} from '../../../shared/paths';
import {shortName} from './display-name';
import {plainBio} from '../../../shared/bio';
import FeedAd,{isFeedAdPosition} from './FeedAd';
import LoadingSkeleton from './LoadingSkeleton';

export function topicName(topics, id) { return topics.find(t => t.id === id)?.name ?? '주제'; }
export function postDate(post) { return new Date((post.published_at ?? post.created_at) * 1000).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); }
function blockText(value){
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(blockText).filter(Boolean).join(' ');
  if(!value||typeof value!=='object')return '';
  if(typeof value.text==='string')return value.text;
  return [blockText(value.content??value.rows??value.cells),blockText(value.children),value.type==='image'?value.props?.caption:value.type==='linkEmbed'?value.props?.title||value.props?.href:''].filter(Boolean).join(' ');
}
function excerpt(post){if(post.excerpt!==undefined)return post.excerpt;return post.body_format==='markdown'&&post.body_doc?(blockText(post.body_doc).slice(0,240)||'포스트 읽기'):post.body.slice(0,240);}
export function Avatar({ writer }) { return <span className="avatar">{writer.avatar_url?<img src={writer.avatar_url} alt="" loading="lazy"/>:Array.from(writer.name)[0]}</span>; }
const paths = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  bookmark: 'M6 3h12v19l-6-4-6 4Z',
  share: 'M12 16V2m-5 5 5-5 5 5M5 12H3v10h18V12h-2',
  read: 'M3 3h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v17h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z M12 5v17',
};
export function Icon({ name }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]}/></svg>; }
export function PostCard({ post: p, topics, first, pending }) {
  return <article className="post">
    <header className="post-header"><a href={writerPath(p.writer)} data-username={p.writer.username} className="author-avatar-button" data-author={p.writer.id} data-author-name={p.writer.name} aria-label={p.writer.name+'의 프로필'}><Avatar writer={p.writer}/></a><a href={writerPath(p.writer)} data-username={p.writer.username} className="author-button" data-author={p.writer.id} data-author-name={p.writer.name} aria-label={p.writer.name + '의 프로필 보기'}><strong title={p.writer.name}>{shortName(p.writer.name)}</strong><time dateTime={new Date((p.published_at ?? p.created_at) * 1000).toISOString()}>{postDate(p)}</time></a><button className="post-category" data-category={p.category}>{topicName(topics, p.category)}</button></header>
    {p.kind==='notice'&&<span className="post-kind-badge">공지</span>}<a href={postPath(p)} className="post-title" data-post={p.id}><h2>{p.title}</h2></a>{p.summary && <p className="post-summary">{p.summary}</p>}
    {(p.writer_category||p.writer_tags?.length>0)&&<div className="post-writer-labels" aria-label="필자의 분류와 태그">{p.writer_category&&<span className="post-writer-category">{p.writer_category.name}</span>}{p.writer_tags?.map(tag=><span key={tag.id}>#{tag.name}</span>)}</div>}
    {p.image ? <a href={postPath(p)} className="post-visual" data-post={p.id} aria-label={p.title + ' 읽기'}><img src={p.image} alt={p.title} fetchPriority={first ? 'high' : 'auto'} loading={first ? 'eager' : 'lazy'}/><span className="visual-overlay"><span>{topicName(topics, p.category)}</span><span className="open-circle" aria-hidden="true">↗</span></span></a> : <a href={postPath(p)} className="post-text-preview" data-post={p.id} aria-label={p.title + ' 읽기'}>{excerpt(p)}</a>}
    <div className="post-actions"><button className="action" data-like={p.id} disabled={pending.has(p.id)} aria-label={p.title + ' 좋아요'} aria-pressed={p.liked}><Icon name="heart"/><span>{p.like_count}</span></button><button className="action" data-post={p.id} aria-label="포스트 읽기"><Icon name="read"/></button><button className="action" data-save={p.id} disabled={pending.has(p.id)} aria-label={p.title + ' 저장'} aria-pressed={p.saved}><Icon name="bookmark"/></button><button className="action" data-share={p.id} aria-label={p.title + ' 링크 복사'}><Icon name="share"/></button></div>
  </article>;
}
export function EmptyState({ title, children, action, onAction }) { return <div className="empty"><strong>{title}</strong>{children && <p>{children}</p>}{action && <button className="pill" onClick={onAction}>{action}</button>}</div>; }
export function WriterList({ writers }) { return <div className="writer-grid">{writers.map(w => <a href={writerPath(w)} data-username={w.username} key={w.id} className="writer-card" data-author={w.id} data-author-name={w.name}><Avatar writer={w}/><strong title={w.name}>{shortName(w.name)}</strong>{w.bio && <p>{plainBio(w.bio)}</p>}<small>업로드한 포스트 {w.post_count}개 · 프로필 보기 ↗</small></a>)}</div>; }
export function Explore({ topics, writers, writersLoading, writersError, posts, total, query, topicId, loading, error,adsEnabled=true }) {
  const strip = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const update = () => { const el = strip.current; if (el) setEdges({ start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }); };
  useLayoutEffect(() => { update(); const observer = new ResizeObserver(update); if (strip.current) observer.observe(strip.current); return () => observer.disconnect(); }, [writers.length, topicId, query]);
  const slide = direction => strip.current?.scrollBy({ left: direction * strip.current.clientWidth * .8, behavior: (document.documentElement.dataset.reduceMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'instant' : 'smooth' });
  return <>
    <section className="explore-section"><div className="explore-heading"><h2>{query || topicId !== 'all' ? '검색한 프로필' : '멤버 둘러보기'}</h2><div className="carousel-controls"><button onClick={() => slide(-1)} disabled={edges.start} aria-label="이전 프로필">‹</button><button onClick={() => slide(1)} disabled={edges.end} aria-label="다음 프로필">›</button></div></div>
      {writersError ? <p className="auth-error" role="alert">{writersError}</p> : writersLoading ? <LoadingSkeleton variant="creators" label="프로필을 불러오고 있어요."/> : null}
      <div className="creator-strip" ref={strip} onScroll={update}>{writers.map(w => <a href={writerPath(w)} data-username={w.username} className="creator-card" key={w.id} data-author={w.id} data-author-name={w.name}><span className="creator-picture creator-initial">{w.avatar_url?<img src={w.avatar_url} alt="" loading="lazy"/>:<span>{Array.from(w.name)[0]}</span>}</span><strong title={w.name}>{shortName(w.name)}</strong><small>{plainBio(w.bio) || '업로드한 포스트 ' + w.post_count + '개'}</small></a>)}</div>
      {!writersLoading && !writersError && !writers.length && <p className="explore-empty">일치하는 프로필이 없어요.</p>}
    </section>
    <section className="explore-section"><div className="explore-heading"><h2>{query || topicId !== 'all' ? '검색한 포스트' : '최신 포스트'} {!loading&&<small>{total}</small>}</h2></div>{loading && !posts.length ? <LoadingSkeleton variant="results"/> : error ? null : posts.length ? <div className="explore-results">{posts.flatMap((p,index) => [<a href={postPath(p)} key={p.id} className="explore-result" data-post={p.id}><span className="result-category">{topicName(topics, p.category)}</span><strong>{p.title}</strong><p>{p.summary}</p><small>{p.writer.name} · {postDate(p)}</small></a>,...(isFeedAdPosition(index,posts.length)?[<FeedAd key={'search-ad-after-'+p.id} after={index+1} variant="grid" enabled={adsEnabled}/>]:[])])}</div> : <p className="explore-empty">일치하는 포스트가 없어요.</p>}</section>
    <section className="explore-section"><div className="explore-heading"><h2>주제 둘러보기</h2></div><div className="topic-grid">{topics.map(t => <button key={t.id} className="topic-tile" data-explore-topic={t.id} style={{ '--topic-color': t.color }}><span><strong>{t.name}</strong><small>{t.post_count}개의 포스트</small></span><span aria-hidden="true">{t.symbol}</span></button>)}</div></section>
  </>;
}
