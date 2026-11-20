import {OAuthAuthorizationServer,AuthorizationError,CimdFetchError,OAuthError,type AuthRequest,type ConsentDescription} from '@cloudflare/workers-oauth-provider';
import {randomBytes,randomUUID} from 'node:crypto';
import {type AuthEnv,type UserRow,currentUser,requireUser,checkOrigin,cookie,readCookie,digest,limited,now,local} from './session';
import {json,readBody,HttpError} from './http';
import {oauthStorage,oauthExclusive} from './mcp-storage';
import {CANONICAL_ORIGIN} from '../../../shared/site';
import {legal} from './legal';

export type McpEnv=AuthEnv&{MEDIA:R2Bucket;MEDIA_BASE_URL?:string};
type ProviderEnv=McpEnv&{OAUTH_KV:KVNamespace};
export const scopeLabels:Record<string,string>={
  'account:read':'내 프로필·이메일·권한과 로그인 연결 상태 조회',
  'posts:read':'내 초안·포스트·공지 본문과 분류 조회',
  'posts:write':'초안 생성·수정, 이미지 업로드와 분류 관리',
  'analytics:read':'내 포스트의 조회·저장·좋아요와 방문 통계 조회',
  'offline_access':'연결을 유지하기 위한 토큰 갱신',
};
export type McpConnection={id:string;user_id:string;grant_id:string|null;client_id:string;client_name:string;client_domain:string|null;redirect_host:string;scope:string;login_version:number;created_at:number;expires_at:number;last_used_at:number|null;revoked_at:number|null};
type Flow={id:string;browser_hash:string;request_json:string;description_json:string;expires_at:number};
export type McpProps={connectionId:string;userId:string;loginVersion:number};
export function mcpOrigin(request:Request){return local(request)?new URL(request.url).origin:CANONICAL_ORIGIN;}
export function providerFor(request:Request,env:McpEnv){
  const origin=mcpOrigin(request),resource=origin+'/mcp',bindings={...env,OAUTH_KV:oauthStorage(env.DB)};
  const server=new OAuthAuthorizationServer<ProviderEnv>({
    issuer:origin,resources:[resource],authorizeEndpoint:'/oauth/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',
    scopesSupported:Object.keys(scopeLabels),clientIdMetadataDocumentEnabled:true,
    accessTokenTTL:600,refreshTokenTTL:30*86400,clientRegistrationTTL:90*86400,
    tokenExchangeCallback:async options=>{
      if(!['authorization_code','refresh_token'].includes(options.grantType))throw new OAuthError('unsupported_grant_type',{description:'This grant type is not enabled.'});
      const props=options.props as McpProps;
      const row=await options.env.DB.prepare('SELECT c.id FROM mcp_connections c JOIN auth_users u ON u.id=c.user_id WHERE c.id=? AND c.user_id=? AND c.client_id=? AND c.revoked_at IS NULL AND c.expires_at>? AND c.login_version=u.login_version AND u.disabled=0 AND u.login_version=?').bind(props.connectionId,options.userId,options.clientId,now(),props.loginVersion).first();
      if(!row)throw new OAuthError('invalid_grant',{description:'The connection has expired or was revoked.'});
      await options.env.DB.prepare('UPDATE mcp_connections SET grant_id=? WHERE id=? AND (grant_id IS NULL OR grant_id=?)').bind(options.grantId,props.connectionId,options.grantId).run();
      if(!options.scope.includes('offline_access'))return {refreshTokenTTL:0};
    },
    clientRegistrationCallback:({clientMetadata})=>{
      if(typeof clientMetadata.client_name!=='string'||!clientMetadata.client_name.trim()||clientMetadata.client_name.length>120)return {description:'A client_name of 1–120 characters is required.'};
      if(!Array.isArray(clientMetadata.redirect_uris)||clientMetadata.redirect_uris.length>8)return {description:'Register at most eight redirect URIs.'};
    },
    onError:error=>{console.warn('MCP OAuth rejected',error.code);},
  });
  return {server,bindings,api:server.getOAuthApi(bindings),origin,resource};
}
function method(allow:string){return json({error:'지원하지 않는 요청입니다.'},405,{Allow:allow});}
function scopesFor(user:UserRow){return Object.keys(scopeLabels).filter(scope=>user.role!=='reader'||['account:read','offline_access'].includes(scope));}
async function boundFlow(request:Request,env:McpEnv,id:string){
  if(!/^[\w-]{36}$/.test(id))throw new HttpError(400,'연결 요청을 다시 시작해 주세요.');
  const flow=await env.DB.prepare('SELECT * FROM mcp_flows WHERE id=? AND expires_at>?').bind(id,now()).first<Flow>();
  if(!flow||digest(readCookie(request,'mcp_'+id))!==flow.browser_hash)throw new HttpError(410,'연결 요청이 만료되었거나 다른 브라우저에서 열렸습니다. AI 앱에서 다시 연결해 주세요.');
  return flow;
}
export async function mcpLoginReturn(request:Request,env:McpEnv,response:Response){
  const url=new URL(request.url),location=response.headers.get('Location');
  // Bind the return flow to this exact upstream OAuth state. A pending MCP tab
  // must never redirect an unrelated website sign-in away from /home.
  if(/^\/api\/auth\/(google|github)$/.test(url.pathname)&&url.searchParams.has('mcp_request')){
    const flow=await boundFlow(request,env,url.searchParams.get('mcp_request')!);
    const state=location?new URL(location).searchParams.get('state'):null;
    if(response.status!==302||!state)return response;
    const result=new Response(response.body,response);result.headers.append('Set-Cookie',cookie(request,'mcp_signin_'+digest(state).slice(0,24),flow.id,600));return result;
  }
  const suffix='mcp_signin_'+digest(url.searchParams.get('state')??'').slice(0,24),id=readCookie(request,suffix);
  if(!id||!location?.includes('/?auth'))return response;
  const result=new Response(response.body,response);result.headers.append('Set-Cookie',cookie(request,suffix,'',0));
  try{
    await boundFlow(request,env,id);
    const target=new URL(location),next=new URL('/connect',target.origin);next.searchParams.set('request',id);
    for(const key of ['auth','auth_error'])if(target.searchParams.has(key))next.searchParams.set(key,target.searchParams.get(key)!);
    result.headers.set('Location',next.href);return result;
  }catch{return result;}
}
export async function connectionFor(env:McpEnv,props:McpProps){
  if(!props||typeof props.connectionId!=='string'||typeof props.userId!=='string'||!Number.isSafeInteger(props.loginVersion))throw new HttpError(401,'유효한 앱 연결이 필요합니다.');
  const user=await env.DB.prepare('SELECT u.* FROM auth_users u JOIN mcp_connections c ON c.user_id=u.id WHERE c.id=? AND c.user_id=? AND c.revoked_at IS NULL AND c.expires_at>? AND u.disabled=0 AND u.login_version=c.login_version AND u.login_version=?').bind(props.connectionId,props.userId,now(),props.loginVersion).first<UserRow>();
  if(!user)throw new HttpError(401,'연결이 해제되었거나 만료되었습니다. 다시 연결해 주세요.');
  return user;
}
export async function handleMcpOAuth(request:Request,env:McpEnv,ctx:ExecutionContext){
  const url=new URL(request.url),path=url.pathname,{server,bindings,api,origin,resource}=providerFor(request,env);
  if(new URL(request.url).origin!==origin)throw new HttpError(421,'메인 도메인에서 연결해 주세요.');
  if(path.startsWith('/.well-known/oauth-protected-resource'))return ['GET','HEAD'].includes(request.method)?json({resource,authorization_servers:[origin],resource_name:'21st ARK',bearer_methods_supported:['header'],scopes_supported:['account:read']}):method('GET, HEAD');
  if(path.startsWith('/.well-known/'))return server.fetch(request,bindings,ctx);
  if(path==='/oauth/authorize'){
    if(request.method!=='GET')return method('GET');
    if(url.search.length>16000)throw new HttpError(400,'연결 요청이 너무 깁니다.');
    if(await limited(env.DB,digest('mcp-authorize:'+(request.headers.get('CF-Connecting-IP')||'local')),60))throw new HttpError(429,'연결 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    try{
      const auth=await api.parseAuthRequest(request);
      if(!auth.codeChallenge||auth.codeChallengeMethod!=='S256')throw new HttpError(400,'PKCE S256을 지원하는 앱에서 연결해 주세요.');
      if(auth.scope.some(scope=>!Object.hasOwn(scopeLabels,scope)))throw new HttpError(400,'지원하지 않는 권한을 요청했습니다.');
      const description=await api.describeConsent(auth),id=randomUUID(),browser=randomBytes(32).toString('hex');
      await env.DB.prepare('INSERT INTO mcp_flows(id,browser_hash,request_json,description_json,expires_at) VALUES(?,?,?,?,?)').bind(id,digest(browser),JSON.stringify(auth),JSON.stringify(description),now()+600).run();
      const headers=new Headers({Location:origin+'/connect?request='+id,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
      headers.append('Set-Cookie',cookie(request,'mcp_'+id,browser,600));
      return new Response(null,{status:303,headers});
    }catch(error){
      if(error instanceof AuthorizationError&&error.redirectTo)return new Response(null,{status:303,headers:{Location:error.redirectTo,'Cache-Control':'no-store'}});
      if(error instanceof AuthorizationError||error instanceof CimdFetchError)throw new HttpError(400,'연결 앱 정보를 확인하지 못했습니다. 앱의 MCP 설정을 확인해 주세요.');
      throw error;
    }
  }
  if(path.startsWith('/oauth/')){
    if(await limited(env.DB,digest('mcp-oauth:'+path+':'+(request.headers.get('CF-Connecting-IP')||'local')),path==='/oauth/register'?20:200))return json({error:'temporarily_unavailable'},429,{'Retry-After':'60'});
    // Bound before handing the body to the provider, including chunked requests.
    if(request.method==='POST'){
      const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
      if(reader)for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new HttpError(413,'요청이 너무 큽니다.');}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      request=new Request(request,{body:bytes});
      try{return await oauthExclusive(env.DB,()=>server.fetch(request,bindings,ctx));}
      catch(error){if(error instanceof HttpError&&error.status===503)return json({error:'temporarily_unavailable',error_description:'Retry this request shortly.'},503,{'Retry-After':'3'});throw error;}
    }
    return server.fetch(request,bindings,ctx);
  }
  const flowId=path.match(/^\/api\/mcp\/authorization\/([\w-]+)$/)?.[1];
  if(flowId){
    const flow=await boundFlow(request,env,flowId),auth=JSON.parse(flow.request_json) as AuthRequest,description=JSON.parse(flow.description_json) as ConsentDescription;
    if(request.method==='GET'){
      const user=await currentUser(request,env);
      return json({client:description,user:user?{id:user.id,name:user.name,role:user.role}:null,scopes:scopeLabels,available_scopes:user?scopesFor(user):[],requested_scopes:auth.scope.length?auth.scope:['account:read','posts:read','offline_access'],expires_at:flow.expires_at});
    }
    if(request.method!=='POST')return method('GET, POST');
    checkOrigin(request);const body=await readBody(request);
    if(typeof body.approve!=='boolean')throw new HttpError(400,'연결 승인 여부를 확인해 주세요.');
    const user=body.approve?await requireUser(request,env):null;
    const scope=body.scopes;
    if(user&&(!user.username_confirmed||body.user_id!==user.id||!Array.isArray(scope)||!scope.length||scope.some(s=>typeof s!=='string'||!scopesFor(user).includes(s))||!scope.includes('account:read')))throw new HttpError(400,'현재 계정과 허용할 권한을 다시 확인해 주세요.');
    return oauthExclusive(env.DB,async()=>{
      const consumed=await env.DB.prepare('DELETE FROM mcp_flows WHERE id=? AND browser_hash=? AND expires_at>? RETURNING id').bind(flowId,flow.browser_hash,now()).first();
      if(!consumed)throw new HttpError(410,'이미 처리한 연결 요청입니다.');
      const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',cookie(request,'mcp_'+flowId,'',0));
      if(!body.approve){const back=new URL(auth.redirectUri);back.searchParams.set('error','access_denied');back.searchParams.set('state',auth.state);back.searchParams.set('iss',origin);return json({redirect:back.href},200,headers);}
      if(!user||!Array.isArray(scope))throw new HttpError(401,'로그인이 필요합니다.');
      const id=randomUUID();
      await env.DB.prepare('INSERT INTO mcp_connections(id,user_id,client_id,client_name,client_domain,redirect_host,scope,consent_version,login_version,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,auth.clientId,description.clientName.slice(0,120),description.clientDomain??null,description.redirectHost,JSON.stringify([...new Set(scope)]),legal.version,user.login_version,now()+(scope.includes('offline_access')?30*86400:600)).run();
      try{
        const result=await api.completeAuthorization({request:auth,userId:user.id,scope,metadata:{connectionId:id,clientName:description.clientName.slice(0,120)},props:{userId:user.id,connectionId:id,loginVersion:user.login_version} satisfies McpProps});
        const grantId=new URL(result.redirectTo).searchParams.get('code')?.split(':')[1];
        if(grantId)await env.DB.prepare('UPDATE mcp_connections SET grant_id=? WHERE id=?').bind(grantId,id).run();
        return json({redirect:result.redirectTo},200,headers);
      }catch(error){await env.DB.prepare('UPDATE mcp_connections SET revoked_at=? WHERE id=?').bind(now(),id).run();throw error;}
    });
  }
  if(path==='/api/mcp/connections'&&request.method==='GET'){
    const user=await requireUser(request,env);
    const rows=await env.DB.prepare("SELECT c.id,c.client_name,c.client_domain,c.redirect_host,c.scope,c.created_at,c.expires_at,c.last_used_at,c.revoked_at,c.login_version,EXISTS(SELECT 1 FROM mcp_oauth_storage s WHERE s.key='grant:'||c.user_id||':'||c.grant_id AND (s.expires_at IS NULL OR s.expires_at>unixepoch())) AS grant_live FROM mcp_connections c WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 100").bind(user.id).all<McpConnection&{grant_live:number}>();
    const events=await env.DB.prepare('SELECT a.id,a.tool,a.post_id,a.outcome,a.created_at,c.client_name FROM mcp_audit a JOIN mcp_connections c ON c.id=a.connection_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 30').bind(user.id).all();
    return json({endpoint:resource,scopes:scopeLabels,connections:rows.results.map(({grant_live,login_version,...row})=>({...row,scope:JSON.parse(row.scope),active:Boolean(grant_live)&&!row.revoked_at&&row.expires_at>now()&&login_version===user.login_version})),activity:events.results});
  }
  const connectionId=path.match(/^\/api\/mcp\/connections\/([\w-]+)$/)?.[1];
  if(connectionId&&request.method==='DELETE'){
    checkOrigin(request);const user=await requireUser(request,env);
    const connection=await env.DB.prepare('UPDATE mcp_connections SET revoked_at=coalesce(revoked_at,?) WHERE id=? AND user_id=? RETURNING grant_id').bind(now(),connectionId,user.id).first<{grant_id:string|null}>();
    if(!connection)throw new HttpError(404,'연결을 찾을 수 없습니다.');
    // Strong D1 revocation above takes effect even if token cleanup must retry.
    if(connection.grant_id)await oauthExclusive(env.DB,()=>api.revokeGrant(connection.grant_id!,user.id));
    return json({revoked:true});
  }
  throw new HttpError(404,'요청한 경로를 찾을 수 없습니다.');
}
