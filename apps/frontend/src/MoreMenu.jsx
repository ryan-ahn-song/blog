import { useEffect, useRef, useState } from 'react';

export default function MoreMenu({user,onSettings,onLogin,onAdmin,onLogout,loggingOut}) {
  const [open,setOpen]=useState(false),anchor=useRef(null),panel=useRef(null),trigger=useRef(null);
  useEffect(()=>{
    if(!open)return;
    panel.current?.querySelector('button')?.focus();
    const outside=event=>{if(!anchor.current?.contains(event.target))setOpen(false);};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  useEffect(()=>setOpen(false),[user?.id]);
  function choose(action){setOpen(false);trigger.current?.focus();action();}
  function move(event){
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const items=[...panel.current.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);
    items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }
  return <div className="rail-more rail-bottom" ref={anchor}>
    <button ref={trigger} className={'rail-button '+(open?'active':'')} onClick={()=>setOpen(value=>!value)} aria-label="더 보기" title="더 보기" aria-haspopup="menu" aria-expanded={open} aria-controls={open?'more-menu':undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>
    {open&&<div id="more-menu" className="more-menu" ref={panel} role="menu" aria-label="더 보기" onKeyDown={move} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget)&&!anchor.current?.contains(event.relatedTarget))setOpen(false);}}>
      {user?<><p className="more-menu-account"><strong>{user.name}</strong><span>{user.email}</span></p><button role="menuitem" onClick={()=>choose(()=>onSettings('account'))}>계정 및 설정<span>↗</span></button></>:<button role="menuitem" onClick={()=>choose(onLogin)}>로그인</button>}
      <button role="menuitem" onClick={()=>choose(()=>onSettings('display'))}>화면 설정</button>
      <button role="menuitem" onClick={()=>choose(()=>onSettings('help'))}>도움말 및 피드백</button>
      {user?.role==='admin'&&<><hr/><button role="menuitem" onClick={()=>choose(onAdmin)}>멤버 관리<span>관리자</span></button></>}
      {user&&<><hr/><button role="menuitem" disabled={loggingOut} onClick={()=>choose(onLogout)}>{loggingOut?'로그아웃 중…':'로그아웃'}</button></>}
    </div>}
  </div>;
}
