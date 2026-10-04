import { withTransaction } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { json,failure,error,methodNotAllowed,readBody,text } from './_lib/http.js';

export default async function handler(req,res){
  const user=await requireUser(req,res); if(!user)return;
  if(req.method!=='POST')return methodNotAllowed(res,['POST']);
  const b=readBody(req),afterRule=text(b.afterRule,300),reason=text(b.reason,500);
  if(!afterRule||!reason)return failure(res,400,'RULE_INPUT_REQUIRED','바꿀 규칙과 변경 이유를 입력해 주세요.');
  try{
    const out=await withTransaction(async client=>{
      const prev=await client.query('SELECT * FROM rule_changes WHERE user_id=$1 FOR UPDATE',[user.id]);
      if(prev.rows[0])return {exists:true};
      const records=await client.query('SELECT * FROM daily_records WHERE user_id=$1 ORDER BY record_date FOR UPDATE',[user.id]);
      if(records.rows.length!==2)return {count:records.rows.length};
      const before=records.rows[records.rows.length-1].rule_snapshot;
      if(before===afterRule)return {same:true};
      const r=await client.query(`INSERT INTO rule_changes(user_id,day1_record_id,day2_record_id,before_rule,after_rule,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[user.id,records.rows[0].id,records.rows[1].id,before,afterRule,reason]);
      return {ruleChange:r.rows[0]};
    });
    if(out.exists)return failure(res,409,'RULE_ALREADY_CHANGED','규칙 변경은 한 번만 기록할 수 있습니다.');
    if(out.count!==undefined)return failure(res,409,'RULE_CHANGE_WINDOW','규칙 변경은 실제 2일차 기록을 저장한 뒤, 3일차 기록 전에만 가능합니다.',{currentRecordCount:out.count});
    if(out.same)return failure(res,400,'RULE_UNCHANGED','변경 후 규칙은 기존 규칙과 달라야 합니다.');
    return json(res,201,{ok:true,...out});
  }catch(e){console.error(e);return error(res,500,'RULE_CHANGE_FAILED','규칙 변경을 저장하지 못했습니다.');}
}
