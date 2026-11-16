export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  const result = new Headers(headers);
  if(!result.has('Cache-Control'))result.set('Cache-Control', 'no-store');
  result.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, { status, headers: result });
}
export async function readBody(request: Request, max = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON 형식으로 요청해 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '요청 내용이 없습니다.');
  let text = '', size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413, '입력한 내용이 너무 큽니다.'); }
    text += decoder.decode(value, { stream: true });
  }
  try {
    const body: unknown = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new HttpError(400, '입력 내용을 확인해 주세요.'); }
}
