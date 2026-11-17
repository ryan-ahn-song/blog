import {imageDimensions} from '../../../shared/image-dimensions';

export const cropFrames={
  avatar:{title:'프로필 사진 조정',width:400,height:400,shape:'round',label:'원형 · 400 × 400px'},
  cover:{title:'커버 이미지 조정',width:1500,height:500,shape:'rect',label:'3:1 · 1500 × 500px'},
  post:{title:'배너 이미지 조정',width:1600,height:900,shape:'rect',label:'16:9 · 1600 × 900px'},
};
export async function loadCropImage(input,signal){
  let blob=input;
  if(typeof input==='string'){
    const url=new URL(input,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/media/'))throw new Error('이 서비스에 업로드한 이미지만 조정할 수 있어요.');
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw new Error('이미지를 불러오지 못했어요. 파일을 다시 선택해 주세요.');
    blob=await response.blob();
  }
  if(!(blob instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(blob.type)||!blob.size||blob.size>8*1024*1024)throw new Error('JPG, PNG, WebP 이미지를 8MB 이하로 선택해 주세요.');
  const data=new Uint8Array(await blob.arrayBuffer());
  const ext=blob.type==='image/png'&&[137,80,78,71,13,10,26,10].every((value,i)=>data[i]===value)?'png':blob.type==='image/jpeg'&&data[0]===255&&data[1]===216&&data[2]===255?'jpg':blob.type==='image/webp'&&new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP'?'webp':null;
  if(!ext)throw new Error('이미지 형식을 확인할 수 없어요. 파일을 다시 저장해 주세요.');
  const {width,height}=imageDimensions(data,ext);
  if(!width||!height||width>8192||height>8192||width*height>24000000)throw new Error('이미지는 한 변 8,192px, 총 2,400만 픽셀 이하로 선택해 주세요.');
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const url=URL.createObjectURL(blob),image=new Image();
  try{
    image.src=url;await image.decode();
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    return {url,image};
  }catch(error){URL.revokeObjectURL(url);if(error.name==='AbortError')throw error;throw new Error('이미지를 읽지 못했어요. 파일을 다시 저장하거나 다른 이미지를 선택해 주세요.');}
}

// The crop rectangle is measured in the rotated image's bounding box.
// Draw directly into a bounded output canvas instead of allocating a full rotated bitmap.
export async function exportCrop(image,area,rotation,purpose){
  const frame=cropFrames[purpose];
  if(!frame||!area||!Number.isFinite(rotation)||![area.x,area.y,area.width,area.height].every(Number.isFinite)||area.width<=0||area.height<=0)throw new Error('이미지 위치를 조정한 뒤 다시 적용해 주세요.');
  const radians=rotation*Math.PI/180,w=image.naturalWidth,h=image.naturalHeight;
  const rotatedWidth=Math.abs(Math.cos(radians)*w)+Math.abs(Math.sin(radians)*h),rotatedHeight=Math.abs(Math.sin(radians)*w)+Math.abs(Math.cos(radians)*h);
  const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
  try{
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저에서 이미지 편집을 사용할 수 없어요.');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.scale(frame.width/area.width,frame.height/area.height);ctx.translate(-area.x,-area.y);ctx.translate(rotatedWidth/2,rotatedHeight/2);ctx.rotate(radians);ctx.drawImage(image,-w/2,-h/2);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
    if(!blob||blob.size>8*1024*1024)throw new Error('조정한 이미지를 저장하지 못했어요. 다른 이미지를 선택해 주세요.');
    const ext=blob.type==='image/webp'?'webp':blob.type==='image/png'?'png':'jpg';
    return new File([blob],purpose+'-cropped.'+ext,{type:blob.type});
  }finally{canvas.width=0;canvas.height=0;}
}
