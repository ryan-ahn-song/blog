import { cleanupAccountMedia } from './account';
import { handleAuth } from './auth';
import { handleAdmin } from './admin';
import { handlePosts, handleMedia, handleReaction } from './posts';
import { handleTopics, handleWriters, handleTrending } from './catalog';
import { handleSubscriptions } from './subscriptions';
import { recordRead, authorDashboard } from './analytics';
import { handleTaxonomy } from './taxonomy';
import { handleComments } from './comments';
import { handleApplications } from './applications';
import { HttpError, json } from './http';
import type { AuthEnv } from './session';
import {handleReadingHistory} from './reading-history';
export interface Env extends AuthEnv { MEDIA: R2Bucket; MEDIA_BASE_URL?: string }
export default {
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil(Promise.all([
      cleanupAccountMedia(env),
      env.DB.batch(['auth_pending_signups','auth_login_limits','auth_sessions','auth_oauth_states','auth_github_states'].map(table=>env.DB.prepare('DELETE FROM '+table+' WHERE expires_at<=unixepoch()'))),
      env.DB.prepare('DELETE FROM account_security_events WHERE created_at<unixepoch()-7776000').run(),
      env.DB.prepare('DELETE FROM reading_history WHERE read_at<unixepoch()-7776000').run(),
    ]));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith('/api/auth/')) return await handleAuth(request, env);
      if(path==='/api/writer-applications'||/^\/api\/admin\/writer-applications(?:\/[\w-]+)?$/.test(path))return await handleApplications(request,env);
      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env);
      if(/^\/api\/writers\/[\w-]+\/taxonomy(?:\/[\w-]+)?$/.test(path))return await handleTaxonomy(request,env);
      if(/^\/api\/posts\/[\w-]+\/comments(?:\/[\w-]+)?$/.test(path))return await handleComments(request,env);
      if (path === '/api/posts' || /^\/api\/posts\/[\w-]+$/.test(path)) return await handlePosts(request, env);
      if (/^\/api\/posts\/[\w-]+\/(like|bookmark)$/.test(path)) return await handleReaction(request,env);
      if(/^\/api\/posts\/[\w-]+\/view$/.test(path))return await recordRead(request,env);
      if(path==='/api/author/dashboard')return await authorDashboard(request,env);
      if(path==='/api/reading-history')return await handleReadingHistory(request,env);
      if (path === '/api/media' || path.startsWith('/api/media/')) return await handleMedia(request, env);
      if (path === '/api/writers'||/^\/api\/writers\/[\w-]+$/.test(path)) return await handleWriters(request,env);
      if (path === '/api/topics') return await handleTopics(request,env);
      if (path === '/api/trending') return await handleTrending(request,env);
      if(path==='/api/subscriptions'||/^\/api\/writers\/[\w-]+\/subscription$/.test(path))return await handleSubscriptions(request,env);
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.message},error.status);
      console.error('API request failed');
      return json({error:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);
    }
    if (request.method === 'GET' && path === '/api/health') {
      return Response.json({ status: 'ok', service: '21st-ark-api' });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
