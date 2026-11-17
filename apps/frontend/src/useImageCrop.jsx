import {useCallback,useEffect,useRef,useState} from 'react';
export default function useImageCrop(){
  const [job,setJob]=useState(null),settle=useRef(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;settle.current?.(null);settle.current=null;};},[]);
  const finish=useCallback(file=>{const resolve=settle.current;settle.current=null;setJob(null);resolve?.(file);},[]);
  const cropImage=useCallback(async(input,purpose)=>{
    const {default:Dialog}=await import('./ImageCropDialog');
    if(!mounted.current)return null;
    settle.current?.(null);
    return new Promise(resolve=>{settle.current=resolve;setJob({Dialog,input,purpose});});
  },[]);
  const cropDialog=job?<job.Dialog input={job.input} purpose={job.purpose} onComplete={finish}/>:null;
  return {cropImage,cropDialog};
}
