import { Component, lazy, Suspense } from 'react';
const BlockReader=lazy(()=>import('./BlockCanvas').then(module=>({default:module.BlockReader})));
class BodyBoundary extends Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="prose">{this.props.body}</div>:this.props.children;}
}
export default function DocumentBody({post}){
  return post.body_format==='markdown'?<BodyBoundary key={post.id+':'+post.revision} body={post.body}><Suspense fallback={<p role="status">본문을 불러오고 있어요.</p>}><BlockReader post={post}/></Suspense></BodyBoundary>:<div className="prose">{post.body}</div>;
}
