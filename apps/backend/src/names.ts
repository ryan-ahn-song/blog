import { HttpError } from './http';
export function displayName(value:unknown){
  if(typeof value!=='string')throw new HttpError(400,'표시 이름을 1~80자로 입력해 주세요.');
  const name=value.normalize('NFC').trim();
  if(!name||name.length>80||/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name))throw new HttpError(400,'표시 이름은 제어 문자 없이 1~80자로 입력해 주세요.');
  return name;
}
