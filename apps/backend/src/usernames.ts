import {usernameValue,usernameKey} from '../../../shared/usernames';
import {HttpError,json} from './http';
import {currentUser,type AuthEnv} from './session';
export function requiredUsername(value:unknown){
  const name=usernameValue(value);
  if(!name)throw new HttpError(400,'유저네임은 공백 없이 2~50자의 한글·영문·숫자·_·-로 입력하고 문자 또는 숫자로 시작해 주세요. 예약된 이름은 사용할 수 없습니다.');
  return {username:name,key:usernameKey(name)};
}
export async function availableUsername(env:AuthEnv,key:string,actorId=''){
  const existing=await env.DB.prepare('SELECT user_id FROM username_aliases WHERE username_key=?').bind(key).first<{user_id:string}>();
  return !existing||existing.user_id===actorId;
}
export async function checkUsername(request:Request,env:AuthEnv){
  if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405,{Allow:'GET'});
  const {username,key}=requiredUsername(new URL(request.url).searchParams.get('username'));
  const actor=await currentUser(request,env);
  return json({username,available:await availableUsername(env,key,actor?.id)});
}
