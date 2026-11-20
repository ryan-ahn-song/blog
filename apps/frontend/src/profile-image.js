import {gifInfo} from '../../../shared/gif';

export const isGifFile=file=>file instanceof Blob&&(file.type==='image/gif'||(!file.type&&/\.gif$/i.test(file.name??'')));
export const isGifKey=key=>typeof key==='string'&&key.endsWith('.gif');
export async function prepareProfileGif(file){
  if(!isGifFile(file)||!file.size||file.size>8*1024*1024)throw new Error('GIF 이미지를 8MB 이하로 선택해 주세요.');
  gifInfo(new Uint8Array(await file.arrayBuffer()));
  return file.type==='image/gif'?file:new File([file],file.name||'profile.gif',{type:'image/gif',lastModified:file.lastModified});
}
