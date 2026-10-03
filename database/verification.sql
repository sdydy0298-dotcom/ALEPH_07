-- PlanDoSee T07 v1.0.0 verification queries
-- 실제 비밀번호, 세션 원문, 세션 해시 자체는 출력하지 않는다.

-- V-01: 비밀번호가 bcrypt 형태의 해시로 저장되었는지 확인
SELECT
  email,
  password_hash LIKE '$2%' AS looks_like_bcrypt,
  length(password_hash) >= 50 AS hash_length_ok
FROM app_users
ORDER BY created_at;

-- V-02: 같은 비밀번호로 만든 두 시험 계정도 저장 해시가 서로 다른지 확인
-- 시험 계정 두 개를 같은 비밀번호로 만든 뒤 distinct_hashes = account_count인지 확인한다.
SELECT
  COUNT(*)::int AS account_count,
  COUNT(DISTINCT password_hash)::int AS distinct_hashes,
  COUNT(*) = COUNT(DISTINCT password_hash) AS all_stored_hashes_different
FROM app_users;

-- V-03: 세션 DB에는 64자리 SHA-256 형태의 값만 저장되고 만료 시각이 있는지 확인
SELECT
  u.email,
  length(s.token_hash) = 64 AS token_hash_length_ok,
  s.expires_at > s.created_at AS has_expiry,
  ROUND(EXTRACT(EPOCH FROM (s.expires_at - s.created_at)) / 3600.0, 1) AS session_hours
FROM app_sessions s
JOIN app_users u ON u.id = s.user_id
ORDER BY s.created_at DESC;

-- V-04: T06 이관 후 소유자 없는 계획이 남지 않았는지 확인
SELECT COUNT(*)::int AS legacy_plan_count
FROM plans
WHERE user_id IS NULL;

-- V-05: 계정별 계획 개수 확인
SELECT
  u.email,
  COUNT(p.id)::int AS plan_count
FROM app_users u
LEFT JOIN plans p ON p.user_id = u.id
GROUP BY u.id, u.email
ORDER BY u.created_at;

-- V-06: 실제 날짜 기록은 사용자/날짜별 한 건인지, 합계/평균이 얼마인지 확인
SELECT
  u.email,
  COUNT(*)::int AS row_count,
  COUNT(DISTINCT d.record_date)::int AS distinct_date_count,
  MIN(d.record_date) AS first_date,
  MAX(d.record_date) AS last_date,
  SUM(d.metric_value)::int AS metric_total_minutes,
  ROUND(AVG(d.metric_value))::int AS metric_average_minutes,
  MIN(d.metric_name) AS metric_name,
  MIN(d.metric_unit) AS metric_unit,
  COUNT(DISTINCT d.question)::int AS question_variants,
  COUNT(DISTINCT d.calculation_rule)::int AS calculation_rule_variants
FROM daily_records d
JOIN app_users u ON u.id = d.user_id
GROUP BY u.id, u.email
ORDER BY u.created_at;

-- V-07: 5일 기록에 고정 질문/지표/단위/계산 규칙이 동일하게 적용되는지 확인
SELECT
  u.email,
  BOOL_AND(d.question = '하루 동안 계획한 일에 실제로 몇 분을 사용했는가?') AS question_fixed,
  BOOL_AND(d.metric_name = '실제 작업 시간') AS metric_fixed,
  BOOL_AND(d.metric_unit = '분') AS unit_fixed,
  COUNT(DISTINCT d.calculation_rule) = 1 AS calculation_rule_fixed
FROM daily_records d
JOIN app_users u ON u.id = d.user_id
GROUP BY u.id, u.email
ORDER BY u.created_at;

-- V-08: 규칙 변경은 사용자당 최대 한 건이며 정확히 2개 기록 뒤에 만들어졌는지 확인
SELECT
  u.email,
  rc.changed_at,
  d1.record_date AS day1_date,
  d2.record_date AS day2_date,
  rc.day1_record_id = d1.id AS day1_reference_ok,
  rc.day2_record_id = d2.id AS day2_reference_ok,
  (SELECT COUNT(*) FROM daily_records d WHERE d.user_id = u.id AND d.created_at < rc.changed_at) AS records_created_before_change,
  rc.before_rule <> rc.after_rule AS rule_actually_changed,
  rc.reason IS NOT NULL AND length(trim(rc.reason)) > 0 AS has_reason
FROM rule_changes rc
JOIN app_users u ON u.id = rc.user_id
LEFT JOIN daily_records d1 ON d1.id = rc.day1_record_id
LEFT JOIN daily_records d2 ON d2.id = rc.day2_record_id
ORDER BY rc.changed_at;

-- V-09: 계정별 자료가 소유자 plan을 기준으로 분리되는지 개수만 확인
SELECT
  u.email,
  COUNT(DISTINCT p.id)::int AS plans,
  COUNT(DISTINCT t.id)::int AS tasks,
  COUNT(DISTINCT e.id)::int AS execution_logs
FROM app_users u
LEFT JOIN plans p ON p.user_id = u.id
LEFT JOIN tasks t ON t.plan_id = p.id AND t.deleted_at IS NULL
LEFT JOIN execution_logs e ON e.task_id = t.id
GROUP BY u.id, u.email
ORDER BY u.created_at;
