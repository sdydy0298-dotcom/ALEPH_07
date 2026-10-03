-- PlanDoSee T06 -> T07 one-time ownership migration
--
-- 사용 방법
-- 1) T07 배포 후 본인 계정을 먼저 생성합니다.
-- 2) 아래 target_email의 예시 주소만 SQL Editor 안에서 본인 계정 이메일로 바꿉니다.
-- 3) 이 파일 자체에는 실제 이메일을 저장하거나 Git에 남기지 않습니다.
-- 4) 실행 후 legacy_plan_count가 0인지 확인합니다.

DO $$
DECLARE
  target_email text := 'YOUR_EMAIL@example.com';
  target_user uuid;
  matched_users integer;
  legacy_plans integer;
BEGIN
  SELECT COUNT(*), MIN(id)
    INTO matched_users, target_user
    FROM app_users
   WHERE email = lower(target_email);

  IF matched_users <> 1 OR target_user IS NULL THEN
    RAISE EXCEPTION 'target_email과 일치하는 계정이 정확히 1개여야 합니다.';
  END IF;

  SELECT COUNT(*) INTO legacy_plans FROM plans WHERE user_id IS NULL;

  UPDATE plans
     SET user_id = target_user,
         updated_at = NOW()
   WHERE user_id IS NULL;

  RAISE NOTICE 'migrated legacy plans: %', legacy_plans;
END $$;

-- 이관 결과는 database/verification.sql의 V-04/V-05로 확인합니다.
