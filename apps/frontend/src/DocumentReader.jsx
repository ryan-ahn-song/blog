import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EmbedPreview } from './EmbedPreview';
import './document-reader.css';
export function readerUrl(value,image=false){
 if(typeof value!=='string'||/[\u0000-\u0020\u007f]/.test(value))return undefined;
 if(/^\/api\/media\/(posts|profiles)\/[\w/-]+\.(png|jpg|webp)$/.test(value))return value;
 if(!image&&(/^#[\w-]+$/.test(value)||/^mailto:[^\s]+$/i.test(value)))return value;
 try{const url=new URL(value);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url.hostname==='media.21stark.dev'&&url.pathname.startsWith('/posts/')?'/api/media'+url.pathname:url.href;}catch{}
 return undefined;
}
const colors={gray:'#aaa',brown:'#b99880',red:'#e39393',orange:'#e5ac75',yellow:'#d8c577',green:'#8cbea1',blue:'#91b9e1',purple:'#b9a0d9',pink:'#dca3c7',white:'#fff',black:'#111'};
const color=value=>colors[value]??(/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(value??'')?value:undefined);
function Inline({content}){
 if(typeof content==='string')return content;
 return (Array.isArray(content)?content:[]).map((token,index)=>{
  if(typeof token==='string')return token;
  if(token.type==='link'){const href=readerUrl(token.href);return href?<a key={index} href={href} target="_blank" rel="noopener noreferrer"><Inline content={token.content}/></a>:<Inline key={index} content={token.content}/>;}
  let text=token.text??'',styles=token.styles??{};
  if(styles.code)text=<code>{text}</code>;
  if(styles.bold)text=<strong>{text}</strong>;
  if(styles.italic)text=<em>{text}</em>;
  if(styles.strike)text=<s>{text}</s>;
  if(styles.underline)text=<u>{text}</u>;
  if(color(styles.textColor)||color(styles.backgroundColor))text=<span style={{color:color(styles.textColor),backgroundColor:color(styles.backgroundColor)}}>{text}</span>;
  return <span key={index}>{text}</span>;
 });
}
function Block({block}){
 const props=block.props??{};let node;
 switch(block.type){
  case 'heading':{const Tag='h'+Math.max(1,Math.min(6,Number(props.level)||1));node=<Tag><Inline content={block.content}/></Tag>;break;}
  case 'quote':node=<blockquote><Inline content={block.content}/></blockquote>;break;
  case 'codeBlock':node=<pre><code><Inline content={block.content}/></code></pre>;break;
  case 'divider':node=<hr/>;break;
  case 'image':{const src=readerUrl(props.url,true);node=src?<figure><img src={src} alt={props.caption||props.name||''} loading="lazy" decoding="async"/>{props.caption&&<figcaption>{props.caption}</figcaption>}</figure>:null;break;}
  case 'linkEmbed':node=<EmbedPreview url={props.href} title={props.title} display={props.display}/>;break;
  case 'toggleListItem':return <details><summary><Inline content={block.content}/></summary><Blocks blocks={block.children}/></details>;
  case 'checkListItem':node=<p className="reader-check"><input type="checkbox" checked={Boolean(props.checked)} readOnly disabled aria-label={props.checked?'완료':'미완료'}/><Inline content={block.content}/></p>;break;
  case 'table':node=<div className="reader-table"><table><tbody>{block.content?.rows?.map((row,i)=><tr key={i}>{row.cells.map((cell,j)=>i<(block.content.headerRows??0)?<th key={j}><Inline content={cell.content??cell}/></th>:<td key={j}><Inline content={cell.content??cell}/></td>)}</tr>)}</tbody></table></div>;break;
  default:node=<p><Inline content={block.content}/></p>;
 }
 return <div style={{textAlign:['left','center','right','justify'].includes(props.textAlignment)?props.textAlignment:undefined,color:color(props.textColor),backgroundColor:color(props.backgroundColor)}}>{node}{block.children?.length>0&&<div className="reader-children"><Blocks blocks={block.children}/></div>}</div>;
}
function Blocks({blocks=[]}){
 const output=[];
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i];
  if(['bulletListItem','numberedListItem'].includes(block.type)){
   const items=[block];while(blocks[i+1]?.type===block.type)items.push(blocks[++i]);
   const Tag=block.type==='numberedListItem'?'ol':'ul';output.push(<Tag key={block.id??i} start={Tag==='ol'?block.props?.start:undefined}>{items.map((item,j)=><li key={item.id??j}><Inline content={item.content}/>{item.children?.length>0&&<Blocks blocks={item.children}/>}</li>)}</Tag>);
  }else output.push(<Block key={block.id??i} block={block}/>);
 }
 return output;
}
const markdownComponents={
 p:({node,children})=>node.children?.length===1&&node.children[0].tagName==='a'&&['영상 임베드','링크 카드'].includes(node.children[0].properties?.title)?<div>{children}</div>:<p>{children}</p>,
 a:({href,title,children})=>['영상 임베드','링크 카드'].includes(title)?<EmbedPreview url={href} title={typeof children==='string'&&children!==href?children:''} display={title==='영상 임베드'?'video':'link'}/>:<a href={readerUrl(href)} target="_blank" rel="noopener noreferrer">{children}</a>,
 img:({src,alt})=><img src={readerUrl(src,true)} alt={alt??''} loading="lazy" decoding="async"/>,
};
export default function DocumentReader({post}){
 if(post.body_format!=='markdown')return <div className="prose">{post.body}</div>;
 return <div className="document-reader">{Array.isArray(post.body_doc)&&post.body_doc.length?<Blocks blocks={post.body_doc}/>:<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={markdownComponents} urlTransform={value=>readerUrl(value)??''}>{post.body??''}</ReactMarkdown>}</div>;
}
