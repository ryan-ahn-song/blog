import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import './image-crop.css';
import {cropFrames,loadCropImage,exportCrop} from './image-crop';

export default function ImageCropDialog({input,purpose,onComplete}){
  const id=useId(),dialog=useRef(null),area=useRef(null);
  const [source,setSource]=useState(null),[crop,setCrop]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[rotation,setRotation]=useState(0),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const frame=cropFrames[purpose];
  useEffect(()=>{const element=dialog.current;element.showModal();return()=>element.close();},[]);
  useEffect(()=>{
    const controller=new AbortController();let url;
    loadCropImage(input,controller.signal).then(value=>{url=value.url;if(controller.signal.aborted)URL.revokeObjectURL(url);else setSource(value);}).catch(error=>{if(error.name!=='AbortError'&&!controller.signal.aborted)setError(error.message);});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[input]);
  function reset(){setCrop({x:0,y:0});setZoom(1);setRotation(0);setError('');}
  async function apply(){
    if(!source||!ready||busy)return;setBusy(true);setError('');
    try{onComplete(await exportCrop(source.image,area.current,rotation,purpose));}catch(e){setError(e.message);setBusy(false);}
  }
  function rotate(value){setRotation(Math.max(-180,Math.min(180,value)));}
  function turn(degrees){const next=rotation+degrees;rotate(next>180?next-360:next<-180?next+360:next);}
  return createPortal(<dialog ref={dialog} className="auth-dialog image-crop-dialog" aria-labelledby={id+'title'} aria-describedby={id+'help'} onCancel={event=>{event.preventDefault();if(!busy)onComplete(null);}}>
    <header><div><h2 id={id+'title'}>{frame.title}</h2><p>{frame.label}</p></div><button type="button" className="image-crop-close" aria-label="이미지 조정 취소" disabled={busy} onClick={()=>onComplete(null)}>×</button></header>
    <p className="image-crop-help" id={id+'help'}>사진을 드래그해 위치를 맞춰 주세요. 확대하거나 회전할 수 있어요.</p>
    <div className={'image-crop-stage '+(frame.shape==='round'?'is-round':'')} aria-busy={!source&&!error} inert={busy}>
      {source?<Cropper image={source.url} crop={crop} zoom={zoom} rotation={rotation} aspect={frame.width/frame.height} cropShape={frame.shape} objectFit="contain" restrictPosition showGrid={frame.shape!=='round'} minZoom={1} maxZoom={5} zoomWithScroll={false} disableAutomaticStylesInjection onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={rotate} onCropAreaChange={(_percent,pixels)=>{area.current=pixels;setReady(true);}} cropperProps={{role:'group','aria-label':'사진 위치 조정','aria-describedby':id+'help'}} mediaProps={{alt:'조정할 이미지',onError:()=>{setReady(false);setError('이미지를 표시하지 못했어요. 파일을 다시 선택해 주세요.');}}}/>:<p role="status">{error?'이미지를 불러오지 못했어요.':'이미지를 불러오고 있어요.'}</p>}
    </div>
    <fieldset disabled={busy||!source} className="image-crop-controls"><div><label htmlFor={id+'zoom'}>확대 <output>{Math.round(zoom*100)}%</output></label><input id={id+'zoom'} type="range" min="1" max="5" step="0.01" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></div><div><label htmlFor={id+'rotation'}>회전 <output>{Math.round(rotation)}°</output></label><input id={id+'rotation'} type="range" min="-180" max="180" step="1" value={rotation} onChange={event=>rotate(Number(event.target.value))}/></div><div className="image-crop-shortcuts"><button type="button" className="pill" aria-label="왼쪽으로 90도 회전" onClick={()=>turn(-90)}>↶ 90°</button><button type="button" className="pill" aria-label="오른쪽으로 90도 회전" onClick={()=>turn(90)}>↷ 90°</button><button type="button" className="text-button" onClick={reset}>초기화</button></div></fieldset>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <footer><button type="button" className="pill" disabled={busy} onClick={()=>onComplete(null)}>취소</button><button type="button" className="pill primary" disabled={!source||!ready||busy} onClick={apply}>{busy?'적용 중…':'이대로 적용'}</button></footer>
  </dialog>,document.body);
}
