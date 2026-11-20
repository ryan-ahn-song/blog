// GIF87a/GIF89a block validation without allocating decoded animation frames.
// Limits apply to the logical canvas of every frame, including partial updates.
export const gifLimits={bytes:8*1024*1024,side:8192,pixels:24000000,frames:300,decodedPixels:60000000};
export function gifInfo(data:Uint8Array){
  const invalid=()=>{throw new Error('GIF 파일이 손상되었거나 형식을 확인할 수 없어요. 다른 파일을 선택해 주세요.');};
  const excessive=()=>{throw new RangeError('GIF의 크기나 재생 길이가 너무 커요. 크기나 프레임 수를 줄여 주세요.');};
  if(data.length>gifLimits.bytes)excessive();
  if(data.length<14||!/^GIF8[79]a$/.test(new TextDecoder().decode(data.subarray(0,6))))invalid();
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),width=view.getUint16(6,true),height=view.getUint16(8,true);
  if(!width||!height)invalid();
  if(width>gifLimits.side||height>gifLimits.side||width*height>gifLimits.pixels)excessive();
  const globalTable=Boolean(data[10]&128);let offset=13+(globalTable?3*(1<<((data[10]&7)+1)):0),frames=0;
  function blocks(){let bytes=0;while(offset<data.length){const size=data[offset++];if(!size)return bytes;if(offset+size>data.length)invalid();offset+=size;bytes+=size;}return invalid();}
  while(offset<data.length){
    const marker=data[offset++];
    if(marker===0x3b){if(!frames||offset!==data.length)invalid();return {width,height,frames};}
    if(marker===0x21){
      if(offset+1>=data.length)invalid();const label=data[offset++];
      if((label===0xf9&&data[offset]!==4)||(label===0xff&&data[offset]!==11)||(label===0x01&&data[offset]!==12))invalid();
      if(label===0xf9){if(offset+6>data.length||data[offset+5]!==0)invalid();offset+=6;}else blocks();
      continue;
    }
    if(marker!==0x2c||offset+9>data.length)invalid();
    const left=view.getUint16(offset,true),top=view.getUint16(offset+2,true),w=view.getUint16(offset+4,true),h=view.getUint16(offset+6,true),packed=data[offset+8];offset+=9;
    if(!w||!h||left+w>width||top+h>height)invalid();
    frames++;if(frames>gifLimits.frames||width*height*frames>gifLimits.decodedPixels)excessive();
    if(packed&128)offset+=3*(1<<((packed&7)+1));else if(!globalTable)invalid();
    if(offset>=data.length||data[offset]<2||data[offset]>8)invalid();offset++;
    if(!blocks())invalid();
  }
  return invalid();
}
