import { json, readBody, HttpError } from './http';
import { type AuthEnv, type UserRow, requireUser, checkOrigin } from './session';
export async function handleAdmin(request: Request, env: AuthEnv) {
  const actor = await requireUser(request, env, ['admin']);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/api/admin/users') {
    const role = url.searchParams.get('role') ?? 'all', query = (url.searchParams.get('q') ?? '').slice(0, 100);
    const page = Math.max(0, Math.min(100000, Number(url.searchParams.get('page')) || 0)) | 0;
    if (!['all', 'reader', 'author', 'admin'].includes(role)) throw new HttpError(400, '권한 필터를 확인해 주세요.');
    const where = " WHERE (?='all' OR role=?) AND (name LIKE ? OR email LIKE ?)";
    const values = [role, role, '%' + query + '%', '%' + query + '%'];
    const users = await env.DB.prepare('SELECT id,email,name,role,disabled,version,created_at FROM auth_users' + where + ' ORDER BY created_at DESC,id LIMIT 30 OFFSET ?').bind(...values, page * 30).all();
    const total = await env.DB.prepare('SELECT count(*) AS total FROM auth_users' + where).bind(...values).first<{total: number}>();
    return json({ users: users.results, total: total?.total ?? 0, page });
  }
  const match = url.pathname.match(/^\/api\/admin\/users\/([\w-]+)$/);
  if (!match) throw new HttpError(404, '요청한 경로를 찾을 수 없습니다.');
  if (request.method !== 'PATCH') return json({ error: '지원하지 않는 요청입니다.' }, 405, { Allow: 'PATCH' });
  checkOrigin(request);
  const body = await readBody(request);
  if (!['reader', 'author', 'admin'].includes(String(body.role)) || typeof body.disabled !== 'boolean' || typeof body.version !== 'number' || !Number.isSafeInteger(body.version)) throw new HttpError(400, '권한과 계정 상태를 확인해 주세요.');
  if (match[1] === actor.id) throw new HttpError(400, '본인의 권한이나 이용 상태는 변경할 수 없습니다.');
  const updated = await env.DB.prepare("UPDATE auth_users SET role=?,disabled=?,version=version+1,login_version=login_version+1 WHERE id=? AND version=? AND (role!='admin' OR (?='admin' AND ?=0) OR EXISTS(SELECT 1 FROM auth_users a WHERE a.id!=auth_users.id AND a.role='admin' AND a.disabled=0)) AND EXISTS(SELECT 1 FROM auth_users a WHERE a.id=? AND a.role='admin' AND a.disabled=0) RETURNING *").bind(body.role, body.disabled ? 1 : 0, match[1], body.version, body.role, body.disabled ? 1 : 0, actor.id).first<UserRow>();
  if (!updated) throw new HttpError(409, '명단이 변경되었거나 마지막 관리자입니다. 새로고침 후 다시 확인해 주세요.');
  await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(updated.id).run();
  return json({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, disabled: updated.disabled, version: updated.version, created_at: updated.created_at } });
}
