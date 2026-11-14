export interface Env { DB: D1Database }
export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/health') {
      return Response.json({ status: 'ok', service: '21st-ark-api' });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
