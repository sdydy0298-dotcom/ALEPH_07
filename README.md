# PlanDoSee v1.1.1

계획을 세우고, 할 일을 관리하고, 실제 작업 기록을 바탕으로 다음 계획을 개선하는 개인 작업 관리 서비스입니다.

T07에서는 기존 T06 PlanDoSee 기능에 **회원가입/로그인, 서버 세션, 비밀번호 보호, 계정별 데이터 격리**를 추가했습니다.

## v1.1.1 변경 사항

- 할 일 상세의 작업 기록을 전역 프런트 상태에만 의존하지 않고, 상세 화면을 열 때 해당 할 일의 기록을 PostgreSQL에서 다시 조회하도록 변경했습니다.
- `GET /api/executions?taskId=...`를 추가해 로그인 사용자의 해당 할 일에 연결된 실제 `execution_logs`만 반환합니다.
- 작업 기록 저장 후 할 일 상세로 돌아올 때 같은 할 일의 기록을 DB에서 다시 조회하므로 방금 추가한 기록이 즉시 표시됩니다.
- 작업 기록 필터링 시 ID 타입 차이로 누락되지 않도록 비교를 정규화했습니다.
- 런타임 샘플 작업 기록이나 예시 작업 기록은 추가하지 않습니다. 할 일 상세에 표시되는 항목은 DB의 실제 `execution_logs` 데이터입니다.
- DB 스키마 변경은 없습니다.

## v1.1.0 변경 사항

- 비로그인 첫 진입의 세션 확인을 정상 상태로 처리해 불필요한 `401` 콘솔 오류를 제거했습니다.
- 사용자 입력 실패와 시스템 오류를 구분하도록 API 응답을 정리했습니다.
- 회원가입·비밀번호 변경의 비밀번호 규칙을 **8자 이상 + 영문 대문자·소문자·숫자·특수문자 포함**으로 조정했습니다.
- 정상적인 입력 검증 실패는 브라우저에서 먼저 안내해 불필요한 `400` 요청을 줄였습니다.
- 인증이 필요한 보호 API의 `401`, 다른 계정 자료 접근의 `404` 등 보안상 필요한 거절 응답은 유지합니다.
- Vercel 현재 런타임에 맞춰 Node.js 버전을 `24.x`로 고정했습니다.
- 할 일 상세 화면을 Style A 구조로 개편해 작업 기록을 날짜별로 누적 확인할 수 있게 했습니다.
- 작업 기록 수·누적 기록 시간·예상 시간 대비 기록 진행률을 표시하며, 완료 처리는 작업 기록과 별도 상태로 유지합니다.

## 주요 기능

### Plan

- 계획 생성 / 수정 / 삭제
- 계획 기간, 우선순위, 예상 시간, 성공 기준 관리
- 수정할 때마다 이전 버전 보존
- 연결된 할 일 진행률 확인

### Do

- 계획별 할 일 추가 / 수정 / 삭제
- 완료 / 되돌리기
- 마감일, 우선순위, 태그, 예상 시간 관리
- 작업 시간과 자유 메모 기록
- 필요한 경우에만 막힌 이유 기록

### See

- 계획별 완료율
- 예상 시간 / 실제 기록 시간 비교
- 완료·지연·막힘 근거 확인
- 다음 계획에 가져갈 개선점 저장
- 실제 날짜 기준 하루 기록과 5일 합계/평균 확인

### Account

- 회원가입 / 로그인 / 로그아웃
- 비밀번호 변경
- 내 데이터 JSON 내보내기
- 계정과 연결된 데이터 삭제

## 인증 방식

PlanDoSee는 **직접 구현한 이메일/비밀번호 인증 + 서버 저장형 세션** 방식을 사용합니다.

사용 라이브러리:

```text
bcryptjs 3.0.2
pg 8.16.3
```

인증 흐름:

```text
비밀번호 원문
  -> bcrypt cost 12
  -> DB에는 password_hash만 저장

로그인 성공
  -> crypto.randomBytes(32)로 무작위 세션 생성
  -> DB에는 SHA-256(token)만 저장
  -> 브라우저에는 HttpOnly 쿠키로 원문 세션 전달
  -> 8시간 뒤 만료
```

브라우저 JavaScript에서 로그인 세션 쿠키 원문을 읽을 수 없도록 `HttpOnly`을 사용합니다.

비밀번호 정책:

```text
8자 이상
영문 대문자 1자 이상
영문 소문자 1자 이상
숫자 1자 이상
특수문자 1자 이상
```

자세한 설계와 대안 비교는 [`docs/AUTH_DESIGN.md`](docs/AUTH_DESIGN.md)에 정리했습니다.

## 프로젝트 구조

```text
Browser
  -> Vercel Functions (/api/*)
      -> DATABASE_URL
          -> Supabase PostgreSQL
```

브라우저 소스에는 DB 접속 문자열, DB 비밀번호, 세션 원문을 넣지 않습니다.

## 빠른 시작

### 1. T06 Git 이력에서 시작

T07용 새 GitHub 저장소를 만들어도 되지만 **T06 최종 commit이 T07 commit의 조상으로 남아 있어야 합니다.**

새 폴더에서 `git init`하지 않습니다.

자세한 순서:

```text
docs/APPLY_TO_T06.md
```

### 2. DB 스키마 적용

Supabase SQL Editor에서:

```text
database/schema.sql
```

전체를 실행합니다.

### 3. Vercel 환경 변수

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require
```

위 값은 형식 예시입니다. 실제 접속 문자열은 Vercel Environment Variables에만 저장하고 GitHub에 올리지 않습니다.

### 4. 배포 확인

```text
https://YOUR-SITE.vercel.app/api/health
```

정상 예시:

```json
{
  "ok": true,
  "database": "postgres",
  "serverTime": "...",
  "kstDate": "..."
}
```

### 5. T06 기존 자료 이관

T06 DB에 이미 계획/할 일/작업 기록이 있다면 T07 계정을 만든 뒤:

```text
database/migrate_t06_owner.sql
```

을 Supabase SQL Editor에서 실행합니다.

SQL Editor 안에서만 예시 이메일을 본인 계정 이메일로 바꾸고, 저장소 파일에는 실제 이메일을 남기지 않습니다.

## T07 실제 5일 기록

관찰 질문과 지표는 고정합니다.

```text
질문: 하루 동안 계획한 일에 실제로 몇 분을 사용했는가?
지표: 실제 작업 시간
단위: 분
```

진행 순서:

```text
DAY 1  실제 날짜 기록
DAY 2  실제 날짜 기록
       ↓
       계획 기준 1회 변경
       ↓
DAY 3  실제 날짜 기록
DAY 4  실제 날짜 기록
DAY 5  실제 날짜 기록
```

날짜는 사용자가 직접 입력하지 않고 서버의 `Asia/Seoul` 현재 날짜를 사용합니다.

계산 규칙:

- 누락: 해당 날짜 작업 기록이 없으면 0분
- 중복: 같은 날짜의 하루 기록은 1건만 유지하고 다시 저장하면 갱신
- 이상치: 임의로 제외하지 않고 저장된 작업 기록을 그대로 포함
- 반올림: 시작/종료 시각 차이를 정수 분으로 반올림
- 주 시작 요일: 월요일
- 날짜 귀속: 작업 시작 시각을 Asia/Seoul 날짜로 변환

## 데이터 격리

계획·할 일·작업 기록 API는 클라이언트가 전달한 사용자 ID를 신뢰하지 않습니다.

서버가 HttpOnly 세션으로 확인한 사용자 ID와 `plans.user_id`를 기준으로 자료 접근을 제한합니다.

예:

```sql
WHERE plans.user_id = $SESSION_USER_ID
```

다른 계정의 plan/task ID를 알고 있어도 소유자가 다르면 `404`로 처리합니다.

## 내보내기

설정 → `내 데이터 내보내기`에서 JSON 파일 하나를 내려받을 수 있습니다.

포함:

```text
plans
planVersions
tasks
statusEvents
executionLogs
reviews
dailyRecords
ruleChange
```

제외:

```text
password_hash
session token
session token hash
DATABASE_URL
```

## 계정 삭제

계정 삭제 전 현재 비밀번호를 다시 확인합니다.

`app_users` 삭제 시 FK `ON DELETE CASCADE`를 통해 해당 사용자의 세션·계획·할 일·작업 기록·하루 기록이 함께 삭제됩니다.

## 실행 환경

이 저장소는 실제 배포용 `v1.1.1`입니다. 개발용 샘플 계정이나 샘플 데이터는 포함하지 않습니다. 회원가입 후 생성한 실제 계정의 데이터만 Vercel API와 PostgreSQL에 저장·조회됩니다.

## 검증 파일

```text
database/verification.sql          DB 검증 쿼리
docs/T07_EVIDENCE_GUIDE.md        실제 브라우저/계정 A-B/5일 증거 절차
docs/AUTH_DESIGN.md               인증 구현 설명서 ①~⑥
docs/APPLY_TO_T06.md              T06 Git 이력 유지 및 적용 순서
docs/T07_FINAL_AUDIT.md            제출 전 정적 검수 결과
```

## 제출 전에 반드시 실제로 확인할 것

코드 정적 검수만으로 완료 판정할 수 없는 항목입니다.

- Vercel 결과물 URL이 새 시크릿 창에서 열리는지
- 실제 회원가입 / 로그인 / 로그아웃
- 실제 DB bcrypt 저장값
- HttpOnly 세션과 8시간 만료
- 비밀번호 변경 후 기존 세션 무효화
- 계정 A/B 양방향 읽기·수정·삭제 거절
- T06 실제 자료 이관
- 실제 Asia/Seoul 날짜 5일 기록
- DAY 2 뒤 / DAY 3 전 계획 기준 1회 변경
- 화면 합계·평균과 5일 수기 계산 일치
- 실제 내보내기 파일
- 시험 계정 삭제
- T06 Full Commit이 T07 제출 commit의 조상인지

## 보안상 남은 제한

현재 로그인 실패 보호는 계정 단위 잠금입니다. IP/기기 단위 rate limit, 이메일 인증, 비밀번호 재설정은 구현 범위에 포함하지 않았습니다.

세부 위험과 이유는 `docs/AUTH_DESIGN.md`의 ⑥에 적었습니다.


## Vercel Hobby 배포

Vercel Hobby의 Serverless Function 수 제한을 넘지 않도록 인증 API를 `api/auth.js` 하나로 통합했습니다. 현재 배포 함수는 총 10개입니다.

