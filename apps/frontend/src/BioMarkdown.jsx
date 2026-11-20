import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function bioUrl(value){
  if(typeof value!=='string'||/[\u0000-\u0020\u007f]/.test(value))return undefined;
  if(/^\/(?!\/)/.test(value)||/^#[\w-]+$/.test(value))return value;
  try{const url=new URL(value);if(['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{}
  return undefined;
}
const heading=({children})=><h3>{children}</h3>;
const components={h1:heading,h2:heading,h3:heading,h4:heading,h5:heading,h6:heading,a:({href,children})=>{const safe=bioUrl(href);return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>:<>{children}</>;}};
export default function BioMarkdown({value}){
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml allowedElements={['p','br','strong','em','del','a','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6']} unwrapDisallowed components={components} urlTransform={value=>bioUrl(value)??''}>{value}</ReactMarkdown>;
}
