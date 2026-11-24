import {useEffect,useRef,useState} from 'react';
import {adsAllowed,loadAdFit,reserveAdUnit} from './adfit';
import './adfit.css';

let callbackId=0;
export function isFeedAdPosition(index,count){return (index+1)%3===0||(count>0&&count<3&&index===count-1);}
export default function FeedAd({enabled=true,after,variant='feed'}){
  const host=useRef(null),[failed,setFailed]=useState(false),[fits,setFits]=useState(true);
  useEffect(()=>{
    if(!enabled||failed||!adsAllowed()||!host.current)return;
    const element=host.current,stage=element.querySelector('.feed-ad-stage');
    let visible=false,wide=false,stop=null,disposed=false;
    function update(){
      if(disposed)return;
      if(!adsAllowed()||!visible||!wide||document.visibilityState==='hidden'){stop?.();stop=null;return;}
      if(stop)return;
      let cancelled=false,ad=null,provider=null,timer;
      const callback='arkAdFitFail'+(++callbackId);
      const release=reserveAdUnit(async unit=>{
        try{
          provider=await loadAdFit();if(cancelled||!adsAllowed())return;
          ad=document.createElement('ins');ad.className='kakao_ad_area';ad.style.display='none';
          ad.dataset.adUnit=unit;ad.dataset.adWidth='300';ad.dataset.adHeight='250';ad.dataset.adOnfail=callback;
          window[callback]=()=>{if(!cancelled&&!disposed){stop?.();stop=null;setFailed(true);}};
          stage.append(ad);provider.render(ad);
          // Ad blockers may silently block the SDK's request/callback.
          timer=setTimeout(()=>{if(!cancelled&&!ad?.querySelector('iframe')&&ad?.style.display==='none')window[callback]?.();},15000);
        }catch{if(!cancelled&&!disposed){stop?.();stop=null;setFailed(true);}}
      });
      stop=()=>{cancelled=true;clearTimeout(timer);delete window[callback];if(ad){try{provider?.destroy(ad);}catch{}ad.remove();}release();};
    }
    const resize=new ResizeObserver(entries=>{wide=entries[0].contentRect.width>=300;setFits(wide);update();});resize.observe(stage);
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();},{threshold:0});observer.observe(element);
    const visibility=()=>update();document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;resize.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',visibility);stop?.();};
  },[enabled,failed]);
  if(!enabled||failed||!adsAllowed())return null;
  return <aside className={'post feed-ad'+(variant==='grid'?' feed-ad-grid':'')} ref={host} aria-label="광고" aria-hidden={!fits||undefined} data-ad-after={after} data-fit={fits}>
    <header className="post-header feed-ad-header"><span className="avatar feed-ad-avatar" aria-hidden="true">AD</span><div className="feed-ad-identity"><strong>광고</strong><span>Kakao AdFit</span></div><span className="feed-ad-label">AD</span></header>
    <div className="feed-ad-stage"/>
  </aside>;
}
