import { handleAuth } from './auth';
export interface Env { DB: D1Database; MEDIA: R2Bucket }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/auth/')) {
      try { return await handleAuth(request, env); }
      catch { console.error('Authentication request failed'); return Response.json({error:'로그인 서비스를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    }
    if (request.method === 'GET' && path === '/api/health') {
      return Response.json({ status: 'ok', service: '21st-ark-api' });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
