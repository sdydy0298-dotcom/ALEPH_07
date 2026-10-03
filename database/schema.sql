CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- T07 authentication tables -------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 40),
    password_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    lock_until TIMESTAMPTZ NULL,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_app_users_email UNIQUE (email),
    CONSTRAINT ck_app_users_email_lower CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON app_sessions(token_hash);

-- T06 PlanDoSee domain tables ----------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES app_users(id) ON DELETE CASCADE,
    current_version_no INTEGER NOT NULL DEFAULT 1 CHECK (current_version_no >= 1),
    source_review_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES app_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL CHECK (version_no >= 1),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    success_criteria TEXT NOT NULL CHECK (length(trim(success_criteria)) > 0),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
    carried_improvement TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_version UNIQUE (plan_id, version_no),
    CONSTRAINT ck_plan_period CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NULL,
    due_date DATE NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    tag TEXT NULL,
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done')),
    status_version INTEGER NOT NULL DEFAULT 0 CHECK (status_version >= 0),
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_active ON tasks(plan_id, deleted_at, status, due_date);

CREATE TABLE IF NOT EXISTS task_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status_version INTEGER NOT NULL CHECK (status_version >= 1),
    from_status TEXT NOT NULL CHECK (from_status IN ('in_progress', 'done')),
    to_status TEXT NOT NULL CHECK (to_status IN ('in_progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_status_version UNIQUE (task_id, status_version),
    CONSTRAINT ck_status_changed CHECK (from_status <> to_status)
);

CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    actual_minutes INTEGER NOT NULL CHECK (actual_minutes >= 0),
    note TEXT NULL,
    blocker_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_execution_period CHECK (ended_at >= started_at)
);
ALTER TABLE execution_logs ADD COLUMN IF NOT EXISTS note TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_task ON execution_logs(task_id, started_at);

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
    task_count INTEGER NOT NULL DEFAULT 0 CHECK (task_count >= 0),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    delayed_count INTEGER NOT NULL DEFAULT 0 CHECK (delayed_count >= 0),
    blocked_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_count >= 0),
    estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
    delta_minutes INTEGER NOT NULL DEFAULT 0,
    improvement_text TEXT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans DROP CONSTRAINT IF EXISTS fk_plans_source_review;
ALTER TABLE plans
    ADD CONSTRAINT fk_plans_source_review
    FOREIGN KEY (source_review_id) REFERENCES reviews(id) ON DELETE SET NULL;

-- T07 real-day evidence -----------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 800),
    rule_snapshot TEXT NOT NULL CHECK (length(trim(rule_snapshot)) BETWEEN 1 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_record_user_date UNIQUE(user_id, record_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_records_user_date ON daily_records(user_id, record_date);

CREATE TABLE IF NOT EXISTS rule_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    day1_record_id UUID NULL REFERENCES daily_records(id) ON DELETE CASCADE,
    day2_record_id UUID NULL REFERENCES daily_records(id) ON DELETE CASCADE,
    before_rule TEXT NOT NULL CHECK (length(trim(before_rule)) BETWEEN 1 AND 300),
    after_rule TEXT NOT NULL CHECK (length(trim(after_rule)) BETWEEN 1 AND 300),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rule_changes ADD COLUMN IF NOT EXISTS day1_record_id UUID NULL REFERENCES daily_records(id) ON DELETE CASCADE;
ALTER TABLE rule_changes ADD COLUMN IF NOT EXISTS day2_record_id UUID NULL REFERENCES daily_records(id) ON DELETE CASCADE;

UPDATE rule_changes rc SET
  day1_record_id = COALESCE(day1_record_id, (SELECT d.id FROM daily_records d WHERE d.user_id=rc.user_id ORDER BY d.record_date LIMIT 1)),
  day2_record_id = COALESCE(day2_record_id, (SELECT d.id FROM daily_records d WHERE d.user_id=rc.user_id ORDER BY d.record_date OFFSET 1 LIMIT 1));

ALTER TABLE rule_changes ALTER COLUMN day1_record_id SET NOT NULL;
ALTER TABLE rule_changes ALTER COLUMN day2_record_id SET NOT NULL;

-- Browser clients must never receive direct table privileges. The application
-- accesses PostgreSQL only through Vercel Functions using DATABASE_URL.
REVOKE ALL ON TABLE
    app_users, app_sessions, plans, plan_versions, tasks, task_status_events,
    execution_logs, reviews, daily_records, rule_changes
FROM anon, authenticated;

-- Keep the five-day observation metric fixed and auditable.
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS metric_name TEXT;
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS metric_unit TEXT;
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS metric_value INTEGER NOT NULL DEFAULT 0 CHECK (metric_value >= 0);
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS calculation_rule TEXT;

UPDATE daily_records SET
  question = '하루 동안 계획한 일에 실제로 몇 분을 사용했는가?',
  metric_name = '실제 작업 시간',
  metric_unit = '분',
  calculation_rule = 'Asia/Seoul 기준 해당 날짜에 시작한 작업 기록의 actual_minutes를 합산한다. 작업 기록이 없으면 0분으로 처리하고, 같은 날짜의 하루 기록은 한 건만 유지하며 다시 저장하면 갱신한다. 비정상적으로 큰 값도 임의로 제외하지 않고 저장된 작업 기록을 그대로 포함한다. 실행 시간은 시작·종료 시각 차이를 분 단위로 반올림한다. 주 시작 요일은 월요일로 본다.';

ALTER TABLE daily_records ALTER COLUMN question SET NOT NULL;
ALTER TABLE daily_records ALTER COLUMN metric_name SET NOT NULL;
ALTER TABLE daily_records ALTER COLUMN metric_unit SET NOT NULL;
ALTER TABLE daily_records ALTER COLUMN calculation_rule SET NOT NULL;
