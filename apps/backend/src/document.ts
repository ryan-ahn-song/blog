import { HttpError } from './http';
import { safeEmbedUrl, describeEmbed } from '../../../shared/embeds';

const blockTypes=new Set(['paragraph','heading','bulletListItem','numberedListItem','checkListItem','toggleListItem','quote','codeBlock','table','divider','image','linkEmbed']);
const safeUrl=(value:string)=>!value||/^https?:\/\/[^\s]+$/i.test(value)||/^mailto:[^\s]+$/i.test(value)||/^\/api\/media\/posts\/[\w-]+\/[\w-]+\.(png|jpg|webp)$/.test(value)||/^#[\w-]+$/.test(value);

/** Bound structured input before passing it to the block editor on another device. */
export function documentFields(body:Record<string,unknown>){
  const format=body.body_format??'plain';
  if(format!=='plain'&&format!=='markdown')throw new HttpError(400,'본문 형식을 확인해 주세요.');
  if(body.body_doc===undefined||body.body_doc===null)return {format,document:null};
  const doc=body.body_doc;
  if(format!=='markdown'||!Array.isArray(doc)||!doc.length||doc.length>1000)throw new HttpError(400,'본문 블록을 확인해 주세요.');
  let nodes=0;
  const ids=new Set<string>();
  function inline(content:unknown){
    if(typeof content==='string')return;
    if(!Array.isArray(content))throw new HttpError(400,'본문의 텍스트를 확인해 주세요.');
    for(const item of content){
      if(typeof item==='string')continue;
      if(!item||typeof item!=='object'||Array.isArray(item))throw new HttpError(400,'본문의 텍스트를 확인해 주세요.');
      const token=item as Record<string,unknown>;
      if(token.type==='text'&&typeof token.text==='string'){
        if(token.styles!==undefined&&(!token.styles||typeof token.styles!=='object'||Array.isArray(token.styles)||Object.values(token.styles).some(value=>typeof value!=='boolean'&&typeof value!=='string')))throw new HttpError(400,'텍스트 서식을 확인해 주세요.');
        continue;
      }
      if(token.type==='link'&&typeof token.href==='string'&&Array.isArray(token.content)){inline(token.content);continue;}
      throw new HttpError(400,'지원하지 않는 텍스트 형식입니다.');
    }
  }
  function values(value:unknown,depth:number){
    if(++nodes>25000||depth>60)throw new HttpError(400,'본문 구조가 너무 복잡합니다.');
    if(value===null||typeof value==='boolean'||typeof value==='number')return;
    if(typeof value==='string'){if(value.length>80000)throw new HttpError(400,'블록의 내용이 너무 깁니다.');return;}
    if(Array.isArray(value)){for(const item of value)values(item,depth+1);return;}
    if(typeof value!=='object')throw new HttpError(400,'본문 블록을 확인해 주세요.');
    for(const [key,item]of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(key))throw new HttpError(400,'잘못된 블록 속성입니다.');
      if(['href','url'].includes(key)&&(typeof item!=='string'||!safeUrl(item)))throw new HttpError(400,'링크는 http, https 또는 이메일 주소를 사용해 주세요.');
      values(item,depth+1);
    }
  }
  function blocks(items:unknown[],depth:number){
    if(depth>16)throw new HttpError(400,'블록의 들여쓰기 단계가 너무 많습니다.');
    for(const item of items){
      if(!item||typeof item!=='object'||Array.isArray(item))throw new HttpError(400,'본문 블록을 확인해 주세요.');
      const block=item as Record<string,unknown>;
      if(typeof block.type!=='string'||!blockTypes.has(block.type))throw new HttpError(400,'지원하지 않는 본문 블록입니다.');
      if(block.id!==undefined&&(typeof block.id!=='string'||block.id.length>128))throw new HttpError(400,'블록 식별자를 확인해 주세요.');
      if(typeof block.id==='string'){if(ids.has(block.id))throw new HttpError(400,'중복된 블록 식별자입니다.');ids.add(block.id);}
      if(block.children!==undefined){if(!Array.isArray(block.children))throw new HttpError(400,'하위 블록을 확인해 주세요.');blocks(block.children,depth+1);}
      if(block.props!==undefined&&(!block.props||typeof block.props!=='object'||Array.isArray(block.props)))throw new HttpError(400,'블록 속성을 확인해 주세요.');
      if(block.props&&Object.values(block.props).some(value=>!['string','number','boolean'].includes(typeof value)))throw new HttpError(400,'블록 속성을 확인해 주세요.');
      const props=(block.props??{}) as Record<string,unknown>;
      if(block.type==='linkEmbed'){
        if(Object.keys(props).some(key=>!['href','title','display'].includes(key))||(props.href!==undefined&&(typeof props.href!=='string'||(props.href!==''&&!safeEmbedUrl(props.href))))||(props.title!==undefined&&(typeof props.title!=='string'||props.title.length>160)))throw new HttpError(400,'임베드 링크(2,048자)와 제목(160자)을 확인해 주세요.');
        if(props.display!==undefined&&!['link','video'].includes(String(props.display)))throw new HttpError(400,'임베드 표시 방식을 확인해 주세요.');
        if(props.display==='video'&&props.href&&describeEmbed(props.href)?.kind!=='video')throw new HttpError(400,'YouTube 또는 Vimeo 영상 링크를 입력해 주세요.');
        if(block.content!==undefined&&block.content!==''&&(!Array.isArray(block.content)||block.content.length))throw new HttpError(400,'임베드 블록의 내용을 확인해 주세요.');
      }
      if(props.level!==undefined&&(!Number.isInteger(props.level)||Number(props.level)<1||Number(props.level)>6))throw new HttpError(400,'제목 단계를 확인해 주세요.');
      if(props.checked!==undefined&&typeof props.checked!=='boolean')throw new HttpError(400,'체크리스트 상태를 확인해 주세요.');
      if(block.content!==undefined&&typeof block.content!=='string'&&!Array.isArray(block.content)&&!(block.type==='table'&&block.content&&typeof block.content==='object'))throw new HttpError(400,'블록 내용을 확인해 주세요.');
      if(block.type!=='table'&&block.content!==undefined)inline(block.content);
      if(block.type==='table'){
        const table=block.content as Record<string,unknown>|undefined;
        if(!table||table.type!=='tableContent'||!Array.isArray(table.rows)||!table.rows.length||table.rows.length>200)throw new HttpError(400,'표의 내용을 확인해 주세요.');
        for(const row of table.rows){
          if(!row||!Array.isArray(row.cells)||!row.cells.length||row.cells.length>40)throw new HttpError(400,'표의 열을 확인해 주세요.');
          for(const cell of row.cells){if(Array.isArray(cell)||typeof cell==='string')inline(cell);else if(cell?.type==='tableCell')inline(cell.content??[]);else throw new HttpError(400,'표의 셀을 확인해 주세요.');}
        }
      }
    }
  }
  values(doc,0);blocks(doc,0);
  const serialized=JSON.stringify(doc);
  if(serialized.length>350000)throw new HttpError(413,'본문 블록의 용량이 너무 큽니다.');
  return {format,document:serialized};
}
