import { HttpError } from './http';
/** Validate dimensions before storing or asking a browser to decode an image. */
export function checkImageDimensions(data:Uint8Array,ext:string){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let width=0,height=0;
  if(ext==='png'&&data.length>=33&&new TextDecoder().decode(data.slice(12,16))==='IHDR'){width=view.getUint32(16);height=view.getUint32(20);}
  if(ext==='jpg'){
    let offset=2;
    while(offset+4<data.length){
      if(data[offset++]!==255)break;while(data[offset]===255)offset++;
      if(offset+3>data.length)break;
      const marker=data[offset++];if(marker===0xD9||marker===0xDA)break;
      const size=view.getUint16(offset);if(size<2||offset+size>data.length)break;
      if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker)&&size>=7){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}
      offset+=size;
    }
  }
  if(ext==='webp'&&data.length>=30){
    const kind=new TextDecoder().decode(data.slice(12,16));
    if(kind==='VP8X'){width=1+data[24]+(data[25]<<8)+(data[26]<<16);height=1+data[27]+(data[28]<<8)+(data[29]<<16);}
    else if(kind==='VP8 '&&data[23]===157&&data[24]===1&&data[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
    else if(kind==='VP8L'&&data[20]===47){width=1+data[21]+((data[22]&63)<<8);height=1+(data[22]>>6)+(data[23]<<2)+((data[24]&15)<<10);}
  }
  if(!width||!height)throw new HttpError(415,'이미지 크기를 확인할 수 없습니다. 이미지를 다시 저장한 뒤 업로드해 주세요.');
  if(width>8192||height>8192||width*height>24000000)throw new HttpError(413,'이미지는 한 변 8,192px, 총 2,400만 픽셀 이하로 올려 주세요.');
  return {width,height};
}
