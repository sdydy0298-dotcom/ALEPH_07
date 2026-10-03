import { query, withTransaction } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json, error, methodNotAllowed, readBody, text, integer, isoDate } from './_lib/http.js';

const PRIORITIES = new Set(['low','medium','high']);

function validatePlanInput(body) {
  const title = text(body.title, 120);
  const startDate = isoDate(body.startDate);
  const endDate = isoDate(body.endDate);
  const priority = text(body.priority, 12);
  const successCriteria = text(body.successCriteria, 600);
  const estimatedMinutes = integer(body.estimatedMinutes, 0, 200000);
  if (!title || !startDate || !endDate || !PRIORITIES.has(priority) || !successCriteria || estimatedMinutes === null) {
    return { error: '계획 입력값을 확인해 주세요.' };
  }
  if (endDate < startDate) return { error: '종료일은 시작일보다 빠를 수 없습니다.' };
  return { title, startDate, endDate, priority, successCriteria, estimatedMinutes };
}

export default async function handler(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  try {
    if (req.method === 'GET') {
      const r = await query(
        `SELECT p.id, p.current_version_no, p.created_at, p.updated_at,
                v.title, v.start_date, v.end_date, v.priority, v.success_criteria,
                v.estimated_minutes, v.carried_improvement, v.created_at AS version_created_at,
                (SELECT COUNT(*)::int FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) AS task_count,
                (SELECT COUNT(*)::int FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL AND t.status='done') AS done_count
           FROM plans p
           JOIN plan_versions v ON v.plan_id=p.id AND v.version_no=p.current_version_no
          WHERE p.user_id=$1
          ORDER BY p.updated_at DESC`,
        [user.id]
      );
      return json(res, 200, { ok: true, plans: r.rows });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const v = validatePlanInput(body);
      if (v.error) return error(res, 400, 'INVALID_PLAN', v.error);
      const created = await withTransaction(async (client) => {
        const p = await client.query('INSERT INTO plans(user_id) VALUES($1) RETURNING id, current_version_no, created_at', [user.id]);
        const plan = p.rows[0];
        const pv = await client.query(
          `INSERT INTO plan_versions(plan_id, version_no, title, start_date, end_date, priority, success_criteria, estimated_minutes, carried_improvement)
           VALUES($1,1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [plan.id, v.title, v.startDate, v.endDate, v.priority, v.successCriteria, v.estimatedMinutes, text(body.carriedImprovement, 600) || null]
        );
        return { plan_id: plan.id, ...plan, ...pv.rows[0] };
      });
      return json(res, 201, { ok: true, plan: created });
    }

    if (req.method === 'PATCH') {
      const body = readBody(req);
      const planId = text(body.planId, 64);
      const v = validatePlanInput(body);
      if (!planId || v.error) return error(res, 400, 'INVALID_PLAN', v.error || '계획을 선택해 주세요.');
      const updated = await withTransaction(async (client) => {
        const locked = await client.query('SELECT id, current_version_no FROM plans WHERE id=$1 AND user_id=$2 FOR UPDATE', [planId, user.id]);
        if (!locked.rows[0]) return null;
        const nextVersion = Number(locked.rows[0].current_version_no) + 1;
        const pv = await client.query(
          `INSERT INTO plan_versions(plan_id, version_no, title, start_date, end_date, priority, success_criteria, estimated_minutes, carried_improvement)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *`,
          [planId, nextVersion, v.title, v.startDate, v.endDate, v.priority, v.successCriteria, v.estimatedMinutes, text(body.carriedImprovement, 600) || null]
        );
        await client.query('UPDATE plans SET current_version_no=$2, updated_at=NOW() WHERE id=$1', [planId, nextVersion]);
        return pv.rows[0];
      });
      if (!updated) return error(res, 404, 'PLAN_NOT_FOUND', '계획을 찾을 수 없습니다.');
      return json(res, 200, { ok: true, version: updated });
    }

    if (req.method === 'DELETE') {
      const planId = text(req.query?.planId, 64);
      if (!planId) return error(res, 400, 'PLAN_REQUIRED', '계획을 선택해 주세요.');
      const r = await query('DELETE FROM plans WHERE id=$1 AND user_id=$2 RETURNING id', [planId, user.id]);
      if (!r.rows[0]) return error(res, 404, 'PLAN_NOT_FOUND', '계획을 찾을 수 없습니다.');
      return json(res, 200, { ok: true });
    }

    return methodNotAllowed(res, ['GET','POST','PATCH','DELETE']);
  } catch (e) {
    console.error(e);
    return error(res, 500, 'PLAN_REQUEST_FAILED', '계획 요청을 처리하지 못했습니다.');
  }
}
