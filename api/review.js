import { query,withTransaction } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,failure,error,methodNotAllowed,readBody,text } from './_lib/http.js';

async function metrics(planId,userId,client={query}){
  const own=await client.query('SELECT id FROM plans WHERE id=$1 AND user_id=$2',[planId,userId]); if(!own.rows[0])return null;
  const r=await client.query(`SELECT
    COUNT(*) FILTER(WHERE t.deleted_at IS NULL)::int AS task_count,
    COUNT(*) FILTER(WHERE t.deleted_at IS NULL AND t.status='done')::int AS completed_count,
    COUNT(*) FILTER(WHERE t.deleted_at IS NULL AND t.status<>'done' AND t.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date)::int AS delayed_count,
    COUNT(*) FILTER(WHERE t.deleted_at IS NULL AND EXISTS(SELECT 1 FROM execution_logs e WHERE e.task_id=t.id AND NULLIF(trim(e.blocker_reason),'') IS NOT NULL))::int AS blocked_count,
    COALESCE(SUM(t.estimated_minutes) FILTER(WHERE t.deleted_at IS NULL),0)::int AS estimated_minutes,
    COALESCE((SELECT SUM(e.actual_minutes)::int FROM execution_logs e JOIN tasks tx ON tx.id=e.task_id WHERE tx.plan_id=$1 AND tx.deleted_at IS NULL),0)::int AS actual_minutes
    FROM tasks t WHERE t.plan_id=$1`,[planId]);
  const m=r.rows[0]; m.delta_minutes=Number(m.actual_minutes)-Number(m.estimated_minutes); return m;
}

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  const planId=text(req.method==='GET'?req.query?.planId:readBody(req).planId,64);
  if(!planId)return failure(res,400,'PLAN_REQUIRED','계획을 선택해 주세요.');
  try{
    if(req.method==='GET'){
      const m=await metrics(planId,user.id); if(!m)return failure(res,404,'PLAN_NOT_FOUND','계획을 찾을 수 없습니다.');
      const stored=await query('SELECT improvement_text,calculated_at,updated_at FROM reviews WHERE plan_id=$1',[planId]);
      const evidence=await query(`SELECT t.id,t.title,t.status,t.due_date,t.estimated_minutes,COALESCE(SUM(e.actual_minutes),0)::int actual_minutes,COUNT(e.id) FILTER(WHERE NULLIF(trim(e.blocker_reason),'') IS NOT NULL)::int blocker_count FROM tasks t LEFT JOIN execution_logs e ON e.task_id=t.id WHERE t.plan_id=$1 AND t.deleted_at IS NULL GROUP BY t.id ORDER BY t.due_date,t.created_at`,[planId]);
      return json(res,200,{ok:true,metrics:m,improvementText:stored.rows[0]?.improvement_text||'',evidence:evidence.rows});
    }
    if(req.method==='PUT'){
      const improvement=text(readBody(req).improvementText,1000);
      const result=await withTransaction(async client=>{
        const m=await metrics(planId,user.id,client); if(!m)return null;
        const r=await client.query(`INSERT INTO reviews(plan_id,task_count,completed_count,delayed_count,blocked_count,estimated_minutes,actual_minutes,delta_minutes,improvement_text,calculated_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
          ON CONFLICT(plan_id) DO UPDATE SET task_count=EXCLUDED.task_count,completed_count=EXCLUDED.completed_count,delayed_count=EXCLUDED.delayed_count,blocked_count=EXCLUDED.blocked_count,estimated_minutes=EXCLUDED.estimated_minutes,actual_minutes=EXCLUDED.actual_minutes,delta_minutes=EXCLUDED.delta_minutes,improvement_text=EXCLUDED.improvement_text,calculated_at=NOW(),updated_at=NOW() RETURNING *`,[planId,m.task_count,m.completed_count,m.delayed_count,m.blocked_count,m.estimated_minutes,m.actual_minutes,m.delta_minutes,improvement||null]);
        return r.rows[0];
      });
      if(!result)return failure(res,404,'PLAN_NOT_FOUND','계획을 찾을 수 없습니다.');
      return json(res,200,{ok:true,review:result});
    }
    return methodNotAllowed(res,['GET','PUT']);
  }catch(e){console.error(e);return error(res,500,'REVIEW_REQUEST_FAILED','돌아보기 요청을 처리하지 못했습니다.');}
}
