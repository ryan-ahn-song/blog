// This tiny independent script also works when the main application chunk fails.
(()=>{
 const root=document.getElementById('root'),boot=root?.querySelector('.boot-screen');if(!boot)return;
 let timer,shown=false;
 function recover(){
  if(shown||!boot.isConnected)return;shown=true;clearTimeout(timer);
  const panel=document.createElement('section');panel.className='boot-recovery';panel.setAttribute('role','alert');
  const title=document.createElement('h1');title.textContent='화면을 불러오지 못했어요.';
  const detail=document.createElement('p');detail.textContent='연결 상태를 확인한 뒤 다시 시도해 주세요.';
  const retry=document.createElement('button');retry.type='button';retry.textContent='다시 불러오기';retry.addEventListener('click',()=>location.reload());panel.append(title,detail,retry);
  const fallback=root.querySelector('.seo-fallback');if(fallback?.textContent.trim()){const read=document.createElement('button');read.type='button';read.textContent='간단한 화면 보기';read.addEventListener('click',()=>{boot.remove();fallback.style.display='block';});panel.append(read);}
  boot.replaceChildren(panel);
 }
 const failed=event=>{if(event.target instanceof HTMLScriptElement||event.filename?.includes('/assets/index-'))recover();};
 window.addEventListener('error',failed,true);timer=setTimeout(recover,15000);
 const observer=new MutationObserver(()=>{if(!boot.isConnected){clearTimeout(timer);window.removeEventListener('error',failed,true);observer.disconnect();}});observer.observe(root,{childList:true});
})();
