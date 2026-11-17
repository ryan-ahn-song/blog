const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
export function shortName(name,limit=16){const text=String(name??''),characters=segmenter?Array.from(segmenter.segment(text),item=>item.segment):Array.from(text);return characters.length>limit?characters.slice(0,limit).join('')+'…':text;}
