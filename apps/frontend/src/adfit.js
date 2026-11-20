// Public placement IDs, issued for https://21st-ark.dev (300 × 250).
export const ADFIT_UNITS=Object.freeze(['DAN-OYeMHcjldND26edn','DAN-O1A7lkHd8yDKbGHn','DAN-2M7vPox6y0K0TXwb']);
export const ADFIT_SCRIPT='https://t1.kakaocdn.net/kas/static/ba.min.js';
export function adsAllowed(){return location.protocol==='https:'&&location.hostname==='21st-ark.dev'&&!navigator.globalPrivacyControl&&navigator.doNotTrack!=='1'&&window.doNotTrack!=='1';}

let sdk;
export function loadAdFit(){
  if(sdk)return sdk;
  if(typeof window.adfit?.render==='function')return Promise.resolve(window.adfit);
  sdk=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=ADFIT_SCRIPT;script.async=true;script.charset='utf-8';script.id='ark-adfit-sdk';
    window.kakaoAdFit??={cmd:[]};
    const ready=()=>{clearTimeout(timer);typeof window.adfit?.render==='function'?resolve(window.adfit):reject(new Error('AdFit unavailable'));};
    const fail=()=>{clearTimeout(timer);script.remove();const queue=window.kakaoAdFit?.cmd;if(Array.isArray(queue)){const index=queue.indexOf(ready);if(index>=0)queue.splice(index,1);}reject(new Error('AdFit unavailable'));};
    const timer=setTimeout(fail,12000);
    // A script load alone does not mean the SDK's async startup checks finished.
    script.onload=()=>window.kakaoAdFit.cmd.push(ready);
    script.onerror=fail;
    document.head.append(script);
  });
  return sdk;
}

// The SDK rejects duplicate unit IDs in a document. Lease a unit only while
// its slot is visible; destroy it before letting another slot reuse that ID.
const occupied=new Set(),queue=[];
function drain(){
  for(const unit of ADFIT_UNITS){
    if(occupied.has(unit))continue;
    const ticket=queue.shift();if(!ticket)return;
    occupied.add(unit);ticket.unit=unit;ticket.receive(unit);
  }
}
export function reserveAdUnit(receive){
  const ticket={receive,unit:null};queue.push(ticket);drain();
  return()=>{
    const index=queue.indexOf(ticket);if(index>=0)queue.splice(index,1);
    if(ticket.unit){occupied.delete(ticket.unit);ticket.unit=null;queueMicrotask(drain);}
  };
}
