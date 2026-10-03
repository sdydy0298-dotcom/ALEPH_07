import { query, withTransaction } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,error,methodNotAllowed,readBody,text } from './_lib/http.js';

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  try{
    if(req.method==='GET'){
      const r=await query(`SELECT id,record_date,summary,rule_snapshot,question,metric_name,metric_unit,metric_value,calculation_rule,created_at,updated_at FROM daily_records WHERE user_id=$1 ORDER BY record_date`,[user.id]);
      const c=await query(`SELECT day1_record_id,day2_record_id,before_rule,after_rule,reason,changed_at FROM rule_changes WHERE user_id=$1`,[user.id]);
      return json(res,200,{ok:true,records:r.rows,ruleChange:c.rows[0]||null,count:r.rows.length});
    }
    if(req.method==='POST'){
      const b=readBody(req),summary=text(b.summary,800),candidate=text(b.ruleSnapshot,300);
      if(!summary)return error(res,400,'SUMMARY_REQUIRED','오늘 기록을 입력해 주세요.');
      const result=await withTransaction(async client=>{
        const todayR=await client.query(`SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS today`);
        const today=todayR.rows[0].today;
        const existing=await client.query(`SELECT * FROM daily_records WHERE user_id=$1 ORDER BY record_date FOR UPDATE`,[user.id]);
        const change=await client.query(`SELECT * FROM rule_changes WHERE user_id=$1`,[user.id]);
        const same=existing.rows.find(x=>String(x.record_date).slice(0,10)===String(today).slice(0,10));
        if(!same && existing.rows.length>=5) return {tooMany:true};
        if(!same && existing.rows.length===2 && !change.rows[0]) return {ruleChangeRequired:true};
        let rule;
        if(same) rule=same.rule_snapshot;
        else if(change.rows[0]) rule=change.rows[0].after_rule;
        else if(existing.rows[0]) rule=existing.rows[0].rule_snapshot;
        else rule=candidate;
        if(!rule)return {ruleRequired:true};
        const metric=await client.query(`SELECT COALESCE(SUM(e.actual_minutes),0)::int AS value
          FROM execution_logs e
          JOIN tasks t ON t.id=e.task_id
          JOIN plans p ON p.id=t.plan_id
          WHERE p.user_id=$1 AND (e.started_at AT TIME ZONE 'Asia/Seoul')::date=$2`,[user.id,today]);
        const metricValue=Number(metric.rows[0]?.value||0);
        const question='하루 동안 계획한 일에 실제로 몇 분을 사용했는가?';
        const metricName='실제 작업 시간';
        const metricUnit='분';
        const calculationRule='Asia/Seoul 기준 해당 날짜에 시작한 작업 기록의 actual_minutes를 합산한다. 작업 기록이 없으면 0분으로 처리하고, 같은 날짜의 하루 기록은 한 건만 유지하며 다시 저장하면 갱신한다. 비정상적으로 큰 값도 임의로 제외하지 않고 저장된 작업 기록을 그대로 포함한다. 실행 시간은 시작·종료 시각 차이를 분 단위로 반올림한다. 주 시작 요일은 월요일로 본다.';
        const saved=await client.query(`INSERT INTO daily_records(user_id,record_date,summary,rule_snapshot,question,metric_name,metric_unit,metric_value,calculation_rule)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(user_id,record_date) DO UPDATE SET summary=EXCLUDED.summary,rule_snapshot=EXCLUDED.rule_snapshot,metric_value=EXCLUDED.metric_value,updated_at=NOW()
          RETURNING *`,[user.id,today,summary,rule,question,metricName,metricUnit,metricValue,calculationRule]);
        return {record:saved.rows[0],updated:Boolean(same)};
      });
      if(result.tooMany)return error(res,409,'FIVE_DAYS_COMPLETE','서로 다른 실제 날짜 5일 기록이 이미 완성되었습니다.');
      if(result.ruleChangeRequired)return error(res,409,'RULE_CHANGE_REQUIRED','3일차 기록 전에 계획 규칙을 한 번 변경해야 합니다.');
      if(result.ruleRequired)return error(res,400,'INITIAL_RULE_REQUIRED','첫날에는 현재 계획 규칙을 입력해 주세요.');
      return json(res,result.updated?200:201,{ok:true,...result});
    }
    return methodNotAllowed(res,['GET','POST']);
  }catch(e){console.error(e);return error(res,500,'DAILY_REQUEST_FAILED','일별 기록 요청을 처리하지 못했습니다.');}
}
