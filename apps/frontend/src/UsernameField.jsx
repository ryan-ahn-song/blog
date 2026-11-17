import {useEffect,useId,useRef,useState} from 'react';
import {api} from './api';
import {usernameValue,usernameKey} from '../../../shared/usernames';
export default function UsernameField({value,onChange,onValidityChange,knownUsername='',disabled=false}){
  const id=useId(),latest=useRef(value);latest.current=value;
  const [checked,setChecked]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[available,setAvailable]=useState(false);
  const normalized=usernameValue(value),own=normalized&&knownUsername&&usernameKey(normalized)===usernameKey(knownUsername);
  const valid=Boolean(normalized&&(own||(available&&checked===value)));
  useEffect(()=>{onValidityChange(valid);},[valid,onValidityChange]);
  async function check(){
    if(busy)return;
    if(!normalized){setMessage('공백 없이 2~50자의 한글·영문·숫자·_·-로 입력하고 문자로 시작해 주세요.');setAvailable(false);return;}
    const requested=value;setBusy(true);setMessage('');
    try{const result=await api('/api/auth/username-availability?'+new URLSearchParams({username:normalized}));if(latest.current!==requested)return;setChecked(requested);setAvailable(result.available);setMessage(result.available?'사용할 수 있는 유저네임입니다.':'이미 사용 중이거나 이전 주소로 보존된 유저네임입니다.');}
    catch(e){if(latest.current===requested){setAvailable(false);setMessage(e.message);}}
    finally{setBusy(false);}
  }
  return <div className="username-field"><label htmlFor={id}>유저네임 <span>공백 없이 · 2–50자</span></label><div className="username-input-row"><input id={id} value={value} required maxLength={50} autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={disabled} aria-describedby={id+'help'} onChange={event=>{onChange(event.target.value);setMessage('');setAvailable(false);}}/><button type="button" className="pill" disabled={disabled||busy||!value.trim()} onClick={check}>{busy?'확인 중…':'중복 확인'}</button></div><p className="username-help" id={id+'help'}>{normalized?'21st-ark.dev/'+normalized:'프로필 주소에 사용합니다. 한글·영문·숫자·_·-를 사용할 수 있어요.'}{knownUsername&&<><br/>변경 전 주소도 내 프로필로 연결되며 다른 사람이 사용할 수 없어요.</>}</p>{(message||own)&&<p className={'username-result '+(valid?'available':'')} role="status">{message||(own?'현재 사용 중인 유저네임입니다.':'')}</p>}</div>;
}
