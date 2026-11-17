import {useEffect} from 'react';
import DocumentBody from './DocumentBody';
import {Avatar,Icon,postDate,topicName} from './ContentViews';
import CommentsSection from './CommentsSection';
import {writerPath} from '../../../shared/paths';
import {shortName} from './display-name';

export default function ArticlePage({post,loading,error,topics,user,pending,onRetry,onEdit,onLogin}){
  useEffect(()=>{if(post)document.getElementById('reader-title')?.focus({preventScroll:true});},[post?.id]);
  if(error)return <div className="reader-message"><h2>포스트를 불러오지 못했어요.</h2><p className="auth-error" role="alert">{error}</p><button className="pill" onClick={onRetry}>다시 시도</button></div>;
  if(!post)return <p className="reader-message" role="status">포스트를 불러오고 있어요.</p>;
  const canEdit=user&&['author','admin'].includes(user.role)&&(user.role==='admin'||user.id===post.writer.id);
  return <article className="reader-page" aria-labelledby="reader-title" aria-busy={loading}>
    <header className="reader-hero">
      <div className="reader-eyebrow">{post.kind==='notice'&&<span>공지</span>}<button data-category={post.category}>{topicName(topics,post.category)}</button>{post.status==='draft'&&<span>초안</span>}</div>
      <h1 id="reader-title" tabIndex={-1}>{post.title}</h1>{post.summary&&<p className="reader-summary">{post.summary}</p>}
      <div className="reader-byline"><a href={writerPath(post.writer)} data-username={post.writer.username} className="reader-writer" data-author={post.writer.id} data-author-name={post.writer.name}><Avatar writer={post.writer}/><span><strong title={post.writer.name}>{shortName(post.writer.name)}</strong><small><time dateTime={new Date((post.published_at??post.created_at)*1000).toISOString()}>{postDate(post)}</time></small></span></a>{canEdit&&<button className="pill" onClick={()=>onEdit(post)}>포스트 수정</button>}</div>
    </header>
    {post.image&&<figure className="reader-cover"><img src={post.image} alt={post.title} fetchPriority="high"/></figure>}
    <div className="article-content reader-body"><DocumentBody post={post}/></div>
    <footer className="reader-footer">
      {(post.writer_category||post.writer_tags?.length>0)&&<div className="reader-labels" aria-label="필자의 분류와 태그">{post.writer_category&&<span>{post.writer_category.name}</span>}{post.writer_tags?.map(tag=><span key={tag.id}>#{tag.name}</span>)}</div>}
      <div className="reader-actions"><button className="action" data-like={post.id} disabled={pending.has(post.id)} aria-label="좋아요" aria-pressed={post.liked}><Icon name="heart"/><span>{post.like_count}</span></button><button className="action" data-save={post.id} disabled={pending.has(post.id)} aria-label="포스트 저장" aria-pressed={post.saved}><Icon name="bookmark"/></button><button className="action" data-share={post.id} aria-label="포스트 링크 복사"><Icon name="share"/></button></div>

    </footer>
    {post.status==='published'&&<CommentsSection key={post.id} post={post} user={user} onLogin={onLogin}/>}
  </article>;
}
