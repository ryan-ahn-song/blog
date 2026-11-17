import {api} from './api';

export async function restoreAccount(signal){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const result=await api('/api/auth/me',{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
      if(result.user!==null&&(!result.user||typeof result.user.id!=='string'||!['reader','author','admin'].includes(result.user.role)))throw new Error('로그인 상태를 확인하지 못했습니다.');
      return result;
    }catch(error){
      if(signal.aborted||error.name==='AbortError'||attempt===2||(error.status&&error.status<500))throw error;
      await new Promise((resolve,reject)=>{
        const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
        const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},200*2**attempt);
        signal.addEventListener('abort',cancel,{once:true});
      });
    }
  }
}
