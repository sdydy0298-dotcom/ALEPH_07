import { query } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,error,methodNotAllowed } from './_lib/http.js';

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  if(req.method!=='GET')return methodNotAllowed(res,['GET']);
  try{
    const [plans,versions,tasks,events,executions,reviews,daily,rule]=await Promise.all([
      query('SELECT id,current_version_no,source_review_id,created_at,updated_at FROM plans WHERE user_id=$1 ORDER BY created_at',[user.id]),
      query(`SELECT v.* FROM plan_versions v JOIN plans p ON p.id=v.plan_id WHERE p.user_id=$1 ORDER BY v.plan_id,v.version_no`,[user.id]),
      query(`SELECT t.* FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE p.user_id=$1 ORDER BY t.created_at`,[user.id]),
      query(`SELECT e.* FROM task_status_events e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE p.user_id=$1 ORDER BY e.created_at`,[user.id]),
      query(`SELECT e.* FROM execution_logs e JOIN tasks t ON t.id=e.task_id JOIN plans p ON p.id=t.plan_id WHERE p.user_id=$1 ORDER BY e.started_at`,[user.id]),
      query(`SELECT r.* FROM reviews r JOIN plans p ON p.id=r.plan_id WHERE p.user_id=$1 ORDER BY r.updated_at`,[user.id]),
      query('SELECT id,record_date,summary,rule_snapshot,question,metric_name,metric_unit,metric_value,calculation_rule,created_at,updated_at FROM daily_records WHERE user_id=$1 ORDER BY record_date',[user.id]),
      query('SELECT id,day1_record_id,day2_record_id,before_rule,after_rule,reason,changed_at FROM rule_changes WHERE user_id=$1',[user.id]),
    ]);
    res.setHeader('Content-Disposition',`attachment; filename="plandosee-export-${new Date().toISOString().slice(0,10)}.json"`);
    return json(res,200,{schemaVersion:'1.0.0',exportedAt:new Date().toISOString(),account:{id:user.id,email:user.email,displayName:user.display_name,createdAt:user.created_at},plans:plans.rows,planVersions:versions.rows,tasks:tasks.rows,statusEvents:events.rows,executionLogs:executions.rows,reviews:reviews.rows,dailyRecords:daily.rows,ruleChange:rule.rows[0]||null});
  }catch(e){console.error(e);return error(res,500,'EXPORT_FAILED','내보내기를 만들지 못했습니다.');}
}
