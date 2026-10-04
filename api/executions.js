import { query } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,failure,error,methodNotAllowed,readBody,text } from './_lib/http.js';

function executionInput(body){
  const startedAt=new Date(body.startedAt);
  const endedAt=new Date(body.endedAt);
  const note=text(body.note,800)||null;
  const blocker=text(body.blockerReason,500)||null;
  if(Number.isNaN(startedAt.getTime())||Number.isNaN(endedAt.getTime())||endedAt<startedAt) return null;
  return {
    startedAt,
    endedAt,
    actualMinutes:Math.max(0,Math.round((endedAt-startedAt)/60000)),
    note,
    blocker
  };
}

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  try{
    if(req.method==='GET'){
      const taskId=text(req.query?.taskId,64);
      const planId=text(req.query?.planId,64);

      if(taskId){
        const ownTask=await query(
          `SELECT t.id FROM tasks t JOIN plans p ON p.id=t.plan_id
           WHERE t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL`,
          [taskId,user.id]
        );
        if(!ownTask.rows[0]) return failure(res,404,'TASK_NOT_FOUND','할 일을 찾을 수 없습니다.');
        const r=await query(
          `SELECT e.*,t.title AS task_title,t.plan_id
           FROM execution_logs e
           JOIN tasks t ON t.id=e.task_id
           JOIN plans p ON p.id=t.plan_id
           WHERE e.task_id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL
           ORDER BY e.started_at DESC, e.created_at DESC`,
          [taskId,user.id]
        );
        return json(res,200,{ok:true,executions:r.rows});
      }

      if(planId){
        const own=await query('SELECT id FROM plans WHERE id=$1 AND user_id=$2',[planId,user.id]);
        if(!own.rows[0]) return failure(res,404,'PLAN_NOT_FOUND','계획을 찾을 수 없습니다.');
      }
      const sql=planId
        ? `SELECT e.*,t.title AS task_title,t.plan_id FROM execution_logs e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE t.plan_id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL ORDER BY e.started_at DESC, e.created_at DESC`
        : `SELECT e.*,t.title AS task_title,t.plan_id FROM execution_logs e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE p.user_id=$1 AND t.deleted_at IS NULL ORDER BY e.started_at DESC, e.created_at DESC`;
      const r=await query(sql,planId?[planId,user.id]:[user.id]);
      return json(res,200,{ok:true,executions:r.rows});
    }

    if(req.method==='POST'){
      const b=readBody(req), taskId=text(b.taskId,64), input=executionInput(b);
      if(!taskId) return failure(res,400,'TASK_REQUIRED','할 일을 선택해 주세요.');
      if(!input) return failure(res,400,'INVALID_EXECUTION','실행 시작/종료 시각을 확인해 주세요.');
      const own=await query(`SELECT t.id FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.user_id=$2 AND t.deleted_at IS NULL`,[taskId,user.id]);
      if(!own.rows[0]) return failure(res,404,'TASK_NOT_FOUND','할 일을 찾을 수 없습니다.');
      const r=await query(
        `INSERT INTO execution_logs(task_id,started_at,ended_at,actual_minutes,note,blocker_reason)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [taskId,input.startedAt.toISOString(),input.endedAt.toISOString(),input.actualMinutes,input.note,input.blocker]
      );
      return json(res,201,{ok:true,execution:r.rows[0]});
    }

    if(req.method==='PATCH'){
      const b=readBody(req), executionId=text(b.executionId,64), input=executionInput(b);
      if(!executionId) return failure(res,400,'EXECUTION_REQUIRED','수정할 작업 기록을 선택해 주세요.');
      if(!input) return failure(res,400,'INVALID_EXECUTION','실행 시작/종료 시각을 확인해 주세요.');
      const r=await query(
        `UPDATE execution_logs e
         SET started_at=$3,ended_at=$4,actual_minutes=$5,note=$6,blocker_reason=$7
         FROM tasks t, plans p
         WHERE e.id=$1 AND e.task_id=t.id AND t.plan_id=p.id
           AND p.user_id=$2 AND t.deleted_at IS NULL
         RETURNING e.*`,
        [executionId,user.id,input.startedAt.toISOString(),input.endedAt.toISOString(),input.actualMinutes,input.note,input.blocker]
      );
      if(!r.rows[0]) return failure(res,404,'EXECUTION_NOT_FOUND','작업 기록을 찾을 수 없습니다.');
      return json(res,200,{ok:true,execution:r.rows[0]});
    }

    if(req.method==='DELETE'){
      const executionId=text(req.query?.executionId,64);
      if(!executionId) return failure(res,400,'EXECUTION_REQUIRED','삭제할 작업 기록을 선택해 주세요.');
      const r=await query(
        `DELETE FROM execution_logs e
         USING tasks t, plans p
         WHERE e.id=$1 AND e.task_id=t.id AND t.plan_id=p.id
           AND p.user_id=$2 AND t.deleted_at IS NULL
         RETURNING e.id,e.task_id`,
        [executionId,user.id]
      );
      if(!r.rows[0]) return failure(res,404,'EXECUTION_NOT_FOUND','작업 기록을 찾을 수 없습니다.');
      return json(res,200,{ok:true,executionId:r.rows[0].id,taskId:r.rows[0].task_id});
    }

    return methodNotAllowed(res,['GET','POST','PATCH','DELETE']);
  }catch(e){console.error(e);return error(res,500,'EXECUTION_REQUEST_FAILED','실행 기록 요청을 처리하지 못했습니다.');}
}
