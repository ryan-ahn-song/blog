import { HttpError } from './http';
import type { AuthEnv } from './session';
type Env=AuthEnv&{MEDIA:R2Bucket};
const bytesLimit=256*1024*1024,filesLimit=1000;
// Import existing R2 objects once so the quota also covers uploads before this migration.
export async function reserveUpload(env:Env,userId:string,key:string,bytes:number){
  if(!await env.DB.prepare('SELECT 1 FROM media_inventory WHERE user_id=?').bind(userId).first()){
    for(const prefix of ['posts/'+userId+'/','profiles/'+userId+'/']){
      let cursor:string|undefined;
      do{
        const page=await env.MEDIA.list({prefix,cursor,limit:500});
        if(page.objects.length)await env.DB.batch(page.objects.map(object=>env.DB.prepare('INSERT OR IGNORE INTO media_uploads(key,user_id,bytes,created_at) VALUES(?,?,?,?)').bind(object.key,userId,object.size,Math.floor(object.uploaded.getTime()/1000))));
        cursor=page.truncated?page.cursor:undefined;
      }while(cursor);
    }
    await env.DB.prepare('INSERT OR IGNORE INTO media_inventory(user_id) SELECT id FROM auth_users WHERE id=? AND disabled=0').bind(userId).run();
  }
  const reserved=await env.DB.prepare('INSERT INTO media_uploads(key,user_id,bytes) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM auth_users WHERE id=? AND disabled=0) AND (SELECT coalesce(sum(bytes),0) FROM media_uploads WHERE user_id=?)+?<=? AND (SELECT count(*) FROM media_uploads WHERE user_id=?)<? RETURNING key').bind(key,userId,bytes,userId,userId,bytes,bytesLimit,userId,filesLimit).first();
  if(!reserved)throw new HttpError(413,'계정 이미지 저장 한도(256MB 또는 1,000개)에 도달했습니다. 관리자에게 문의해 주세요.');
}
