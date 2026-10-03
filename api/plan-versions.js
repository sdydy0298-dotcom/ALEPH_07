import { query } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json, error, methodNotAllowed, text } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const user = await requireUser(req, res); if (!user) return;
  const planId = text(req.query?.planId, 64);
  const r = await query(
    `SELECT v.* FROM plan_versions v JOIN plans p ON p.id=v.plan_id
      WHERE v.plan_id=$1 AND p.user_id=$2 ORDER BY v.version_no DESC`,
    [planId, user.id]
  );
  if (!r.rows.length) return error(res, 404, 'PLAN_NOT_FOUND', '계획을 찾을 수 없습니다.');
  return json(res, 200, { ok: true, versions: r.rows });
}
