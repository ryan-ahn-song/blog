export async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || '요청을 처리하지 못했습니다.'); error.status = response.status; throw error; }
  return body;
}
export const jsonRequest = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const roleName = role => ({ reader: '열람자', author: '작성자', admin: '관리자' }[role] || role);
