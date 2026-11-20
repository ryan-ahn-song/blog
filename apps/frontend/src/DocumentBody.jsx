import {Component,lazy,Suspense} from 'react';
import LoadingSkeleton from './LoadingSkeleton';
const Reader=lazy(()=>import('./DocumentReader'));
class ReadBoundary extends Component{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="prose">{this.props.post.body}</div>:this.props.children;}
}
export default function DocumentBody({post}){
 if(post.body_format!=='markdown')return <div className="prose">{post.body}</div>;
 return <ReadBoundary key={post.id+':'+post.revision} post={post}><Suspense fallback={<LoadingSkeleton variant="text" label="본문을 불러오고 있어요."/>}><Reader post={post}/></Suspense></ReadBoundary>;
}
