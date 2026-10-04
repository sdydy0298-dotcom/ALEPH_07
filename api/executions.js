import { query } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,failure,error,methodNotAllowed,readBody,text } from './_lib/http.js';

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  try{
    if(req.method==='GET'){
      const planId=text(req.query?.planId,64);
      if(planId){
        const own=await query('SELECT id FROM plans WHERE id=$1 AND user_id=$2',[planId,user.id]);
        if(!own.rows[0]) return failure(res,404,'PLAN_NOT_FOUND','계획을 찾을 수 없습니다.');
      }
      const sql=planId
        ? `SELECT e.*,t.title AS task_title,t.plan_id FROM execution_logs e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE t.plan_id=$1 AND p.user_id=$2 ORDER BY e.started_at DESC`
        : `SELECT e.*,t.title AS task_title,t.plan_id FROM execution_logs e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE p.user_id=$1 ORDER BY e.started_at DESC`;
      const r=await query(sql,planId?[planId,user.id]:[user.id]);
      return json(res,200,{ok:true,executions:r.rows});
    }
    if(req.method==='POST'){
      const b=readBody(req), taskId=text(b.taskId,64), startedAt=new Date(b.startedAt), endedAt=new Date(b.endedAt), note=text(b.note,800)||null, blocker=text(b.blockerReason,500)||null;
      if(!taskId) return failure(res,400,'TASK_REQUIRED','할 일을 선택해 주세요.');
      if(Number.isNaN(startedAt.getTime())||Number.isNaN(endedAt.getTime())||endedAt<startedAt) return failure(res,400,'INVALID_EXECUTION','실행 시작/종료 시각을 확인해 주세요.');
      const actualMinutes=Math.max(0,Math.round((endedAt-startedAt)/60000));
      const own=await query(`SELECT t.id FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL`,[taskId,user.id]);
      if(!own.rows[0]) return failure(res,404,'TASK_NOT_FOUND','할 일을 찾을 수 없습니다.');
      const r=await query(`INSERT INTO execution_logs(task_id,started_at,ended_at,actual_minutes,note,blocker_reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[taskId,startedAt.toISOString(),endedAt.toISOString(),actualMinutes,note,blocker]);
      return json(res,201,{ok:true,execution:r.rows[0]});
    }
    return methodNotAllowed(res,['GET','POST']);
  }catch(e){console.error(e);return error(res,500,'EXECUTION_REQUEST_FAILED','실행 기록 요청을 처리하지 못했습니다.');}
}
