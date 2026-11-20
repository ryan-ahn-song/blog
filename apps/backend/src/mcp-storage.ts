import {randomUUID} from 'node:crypto';
import {HttpError} from './http';
import {now} from './session';

/** The OAuth library uses only the JSON/text subset of KV. D1 gives it primary
 * reads, TTL filtering and ordered pagination without eventually-consistent KV.
 * Mutating provider calls must be enclosed in oauthExclusive(). */
export function oauthStorage(db:D1Database):KVNamespace {
  const storage={
    async get(key:string,options?:string|{type?:string}){
      const row=await db.prepare('SELECT value FROM mcp_oauth_storage WHERE key=? AND (expires_at IS NULL OR expires_at>?)').bind(key,now()).first<{value:string}>();
      if(!row)return null;
      return (typeof options==='string'?options:options?.type)==='json'?JSON.parse(row.value):row.value;
    },
    async put(key:string,value:string,options?:{expiration?:number;expirationTtl?:number;metadata?:unknown}){
      if(typeof value!=='string')throw new TypeError('OAuth storage accepts text only');
      const userId=/^(grant|token):/.test(key)?key.split(':')[1]:null;
      await db.prepare('INSERT INTO mcp_oauth_storage(key,value,metadata,user_id,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,metadata=excluded.metadata,expires_at=excluded.expires_at').bind(key,value,options?.metadata===undefined?null:JSON.stringify(options.metadata),userId,options?.expiration??(options?.expirationTtl?now()+options.expirationTtl:null)).run();
    },
    async delete(key:string){await db.prepare('DELETE FROM mcp_oauth_storage WHERE key=?').bind(key).run();},
    async list(options:{prefix?:string;cursor?:string;limit?:number}={}){
      const prefix=options.prefix??'',limit=Math.max(1,Math.min(1000,options.limit??1000));
      const rows=await db.prepare('SELECT key,metadata,expires_at FROM mcp_oauth_storage WHERE key>=? AND key<? AND key>? AND (expires_at IS NULL OR expires_at>?) ORDER BY key LIMIT ?').bind(prefix,prefix+'\uffff',options.cursor??'',now(),limit+1).all<{key:string;metadata:string|null;expires_at:number|null}>();
      const more=rows.results.length>limit,selected=rows.results.slice(0,limit);
      return {keys:selected.map(row=>({name:row.key,...(row.metadata?{metadata:JSON.parse(row.metadata)}:{}),...(row.expires_at?{expiration:row.expires_at}:{})})),list_complete:!more,cursor:more?selected.at(-1)!.key:'',cacheStatus:null};
    },
  };
  return storage as unknown as KVNamespace;
}

// Serialize read/modify/write token rotations and one-use consent/code exchanges
// across all isolates. Contention fails retryably instead of waiting on a Worker.
export async function exclusive<T>(db:D1Database,key:string,work:()=>Promise<T>):Promise<T>{
  const token=randomUUID();
  const acquired=await db.prepare('INSERT INTO mcp_locks(key,token,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE mcp_locks.expires_at<=? RETURNING token').bind(key,token,now()+120,now()).first();
  if(!acquired)throw new HttpError(503,'다른 요청을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.');
  try{return await work();}finally{await db.prepare('DELETE FROM mcp_locks WHERE key=? AND token=?').bind(key,token).run();}
}
export const oauthExclusive=<T>(db:D1Database,work:()=>Promise<T>)=>exclusive(db,'oauth-provider',work);
