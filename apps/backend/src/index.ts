import { handleAuth } from './auth';
import { handleAdmin } from './admin';
import { handlePosts, handleMedia, handleReaction } from './posts';
import { handleTopics, handleWriters } from './catalog';
import { HttpError, json } from './http';
import type { AuthEnv } from './session';
export interface Env extends AuthEnv { MEDIA: R2Bucket; MEDIA_BASE_URL?: string }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith('/api/auth/')) return await handleAuth(request, env);
      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env);
      if (path === '/api/posts' || /^\/api\/posts\/[\w-]+$/.test(path)) return await handlePosts(request, env);
      if (/^\/api\/posts\/[\w-]+\/(like|bookmark)$/.test(path)) return await handleReaction(request,env);
      if (path === '/api/media' || path.startsWith('/api/media/')) return await handleMedia(request, env);
      if (path === '/api/writers') return await handleWriters(request,env);
      if (path === '/api/topics') return await handleTopics(request,env);
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
