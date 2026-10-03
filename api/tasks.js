import { query, withTransaction } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json, error, methodNotAllowed, readBody, text, integer, isoDate } from './_lib/http.js';

const PRIORITIES = new Set(['low','medium','high']);
async function ownedPlan(planId, userId) {
  const r = await query('SELECT id FROM plans WHERE id=$1 AND user_id=$2', [planId, userId]);
  return Boolean(r.rows[0]);
}

export default async function handler(req, res) {
  const user = await requireUser(req, res); if (!user) return;
  try {
    if (req.method === 'GET') {
      const planId = text(req.query?.planId, 64);
      if (planId && !(await ownedPlan(planId, user.id))) return error(res, 404, 'PLAN_NOT_FOUND', '계획을 찾을 수 없습니다.');
      const params = planId ? [user.id, planId] : [user.id];
      const condition = planId ? 'AND t.plan_id=$2' : '';
      const r = await query(
        `SELECT t.*, pv.title AS plan_title,
          COALESCE((SELECT SUM(e.actual_minutes)::int FROM execution_logs e WHERE e.task_id=t.id),0) AS actual_minutes,
          COALESCE((SELECT COUNT(*)::int FROM execution_logs e WHERE e.task_id=t.id AND NULLIF(trim(e.blocker_reason),'') IS NOT NULL),0) AS blocker_count
         FROM tasks t
         JOIN plans p ON p.id=t.plan_id
         JOIN plan_versions pv ON pv.plan_id=p.id AND pv.version_no=p.current_version_no
         WHERE p.user_id=$1 ${condition} AND t.deleted_at IS NULL
         ORDER BY CASE t.status WHEN 'in_progress' THEN 0 ELSE 1 END, t.due_date, t.created_at`,
        params
      );
      return json(res, 200, { ok: true, tasks: r.rows });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const planId = text(b.planId, 64);
      if (!planId || !(await ownedPlan(planId, user.id))) return error(res, 404, 'PLAN_NOT_FOUND', '계획을 찾을 수 없습니다.');
      const title = text(b.title, 160), description = text(b.description, 1000) || null, dueDate = isoDate(b.dueDate);
      const priority = text(b.priority, 12), tag = text(b.tag, 40) || null, estimatedMinutes = integer(b.estimatedMinutes, 0, 100000);
      if (!title || !dueDate || !PRIORITIES.has(priority) || estimatedMinutes === null) return error(res, 400, 'INVALID_TASK', '할 일 입력값을 확인해 주세요.');
      const r = await query(
        `INSERT INTO tasks(plan_id,title,description,due_date,priority,tag,estimated_minutes)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [planId,title,description,dueDate,priority,tag,estimatedMinutes]
      );
      return json(res, 201, { ok:true, task:r.rows[0] });
    }

    if (req.method === 'PATCH') {
      const b = readBody(req), taskId = text(b.taskId,64);
      const owned = await query(`SELECT t.* FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL`, [taskId,user.id]);
      if (!owned.rows[0]) return error(res,404,'TASK_NOT_FOUND','할 일을 찾을 수 없습니다.');

      if (b.status !== undefined) {
        const nextStatus = text(b.status,20);
        if (!['in_progress','done'].includes(nextStatus)) return error(res,400,'INVALID_STATUS','상태값을 확인해 주세요.');
        const changed = await withTransaction(async client => {
          const lock = await client.query(`SELECT t.* FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL FOR UPDATE`,[taskId,user.id]);
          const t = lock.rows[0]; if (!t) return null;
          if (t.status === nextStatus) return t;
          const version = Number(t.status_version)+1;
          const u = await client.query(`UPDATE tasks SET status=$2,status_version=$3,updated_at=NOW() WHERE id=$1 RETURNING *`,[taskId,nextStatus,version]);
          await client.query(`INSERT INTO task_status_events(task_id,status_version,from_status,to_status) VALUES($1,$2,$3,$4)`,[taskId,version,t.status,nextStatus]);
          return u.rows[0];
        });
        return json(res,200,{ok:true,task:changed});
      }

      const planId=text(b.planId,64), title=text(b.title,160), description=text(b.description,1000)||null, dueDate=isoDate(b.dueDate), priority=text(b.priority,12), tag=text(b.tag,40)||null, estimatedMinutes=integer(b.estimatedMinutes,0,100000);
      if(!planId || !(await ownedPlan(planId,user.id))) return error(res,404,'PLAN_NOT_FOUND','연결할 계획을 찾을 수 없습니다.');
      if(!title||!dueDate||!PRIORITIES.has(priority)||estimatedMinutes===null) return error(res,400,'INVALID_TASK','할 일 입력값을 확인해 주세요.');
      const r=await query(`UPDATE tasks SET plan_id=$2,title=$3,description=$4,due_date=$5,priority=$6,tag=$7,estimated_minutes=$8,updated_at=NOW() WHERE id=$1 RETURNING *`,[taskId,planId,title,description,dueDate,priority,tag,estimatedMinutes]);
      return json(res,200,{ok:true,task:r.rows[0]});
    }

    if(req.method==='DELETE'){
      const taskId=text(req.query?.taskId,64);
      const r=await query(`UPDATE tasks t SET deleted_at=NOW(),updated_at=NOW() FROM plans p WHERE t.plan_id=p.id AND t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL RETURNING t.id`,[taskId,user.id]);
      if(!r.rows[0]) return error(res,404,'TASK_NOT_FOUND','할 일을 찾을 수 없습니다.');
      return json(res,200,{ok:true});
    }
    return methodNotAllowed(res,['GET','POST','PATCH','DELETE']);
  } catch(e){ console.error(e); return error(res,500,'TASK_REQUEST_FAILED','할 일 요청을 처리하지 못했습니다.'); }
}
