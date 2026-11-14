interface Env { ASSETS: Fetcher; API: Fetcher }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) return env.API.fetch(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
