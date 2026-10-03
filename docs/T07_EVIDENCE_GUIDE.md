# T07 검증 / 증거 남기기

이 문서는 **배포 후 실제 증거를 남기는 순서**입니다. 비밀번호, 세션 원문, DB 접속 문자열은 캡처·README·제출문에 적지 않습니다.

## 0. T06 연속성 먼저 고정

1. T06 최종 제출 commit의 40자리 Full Commit ID를 따로 보관합니다.
2. T07 작업은 T06의 `.git` 이력을 유지한 복사본에서 시작합니다.
3. T07용 새 GitHub 저장소를 만들었다면 `git init`을 하지 말고 remote만 바꿉니다.
4. T07 최종 commit에서 아래 명령을 실행합니다.

```bash
git merge-base --is-ancestor <T06_FULL_COMMIT> HEAD
echo $?
```

`0`이면 통과입니다.

## 1. 첫 화면과 공개 접근

새 시크릿 창에서 결과물 URL과 GitHub 소스 URL을 엽니다.

확인:
- 계정 생성·로그인·초대·비밀번호·OAuth·CAPTCHA 없이 URL 자체가 열림
- 결과물 첫 화면은 PlanDoSee 로그인/회원가입 화면
- 로그인하지 않은 상태에서는 개인 계획/할 일/기록이 보이지 않음
- GitHub 저장소는 전체 파일과 commit 이력을 새 시크릿 창에서 확인 가능

## 2. T06 자료를 내 T07 계정으로 이관

1. T07 배포 후 **본인 계정을 먼저 생성**합니다.
2. Supabase SQL Editor에서 `database/migrate_t06_owner.sql`을 복사합니다.
3. SQL Editor 안에서만 `YOUR_EMAIL@example.com`을 본인 계정 이메일로 바꿔 실행합니다.
4. 저장소 파일에는 실제 이메일을 넣지 않습니다.
5. `legacy_plan_count = 0`이고 `owned_plan_count`에 기존 T06 계획이 포함되는지 확인합니다.

이관 뒤에는 기존 T06 계획과 그 계획에 연결된 할 일·상태 이벤트·작업 기록·돌아보기가 같은 계정에서 보여야 합니다.

## 3. 계정 A / B 준비

서로 다른 이메일로 시험 계정 A와 B를 만듭니다.

- 두 계정에는 **같은 시험 비밀번호**를 사용해 bcrypt salt 차이도 확인할 수 있게 합니다.
- 실제 제출 캡처에는 비밀번호를 적지 않습니다.
- 각 계정에 서로 다른 계획과 할 일을 1개 이상 만듭니다.

## 4. 비밀번호 저장 방식

Supabase SQL Editor에서 `database/verification.sql`의 V-01과 V-02를 실행합니다.

통과 모습:
- `looks_like_bcrypt = true`
- `hash_length_ok = true`
- 같은 시험 비밀번호를 쓴 A/B의 `all_stored_hashes_different = true`
- 비밀번호 원문을 출력하지 않음

제출문에는 `bcryptjs 3.0.2`, cost 12를 사용했다고 적습니다.

## 5. 로그인 오류 문구

아래 두 경우의 화면 안내가 모두 다음 문구인지 확인합니다.

```text
이메일 또는 비밀번호를 확인해 주세요.
```

- 존재하는 이메일 + 틀린 비밀번호
- 존재하지 않는 이메일 + 임의의 비밀번호

비밀번호 입력값은 캡처하지 않습니다.

## 6. 로그인 전/후 동일 API

DevTools → Console에서 같은 요청을 비교합니다.

```js
fetch('/api/plans').then(async r => [r.status, await r.json()])
```

- 로그인 상태: `200`
- 로그아웃 후 같은 주소·같은 GET: `401`

두 요청의 URL과 method가 같고 달라진 것은 로그인 상태뿐임을 Network에서 남깁니다.

## 7. 세션 만료 / HttpOnly / URL 미노출

로그인 후:

```js
document.cookie
```

통과 모습:
- `pds_session` 원문이 나오지 않음
- DevTools → Application → Cookies에서는 `pds_session`의 HttpOnly 체크 확인
- Network URL query string에 세션 값 없음
- `/api/auth?action=me` 또는 로그인 응답에서 세션 만료 시각과 `durationHours: 8` 확인

DB는 `database/verification.sql`의 V-03으로 확인합니다.

## 8. 로그아웃 후 이전 세션 무효화

로그인 상태에서 `/api/plans`가 200인지 확인 → 로그아웃 → 같은 요청 재실행.

통과 모습: `401`.

## 9. 비밀번호 변경 후 기존 세션 전체 무효화

브라우저 A와 브라우저 B에서 같은 계정으로 로그인합니다.

1. 브라우저 A에서 비밀번호 변경
2. 브라우저 B에서 `/api/plans` 다시 요청

통과 모습:
- 브라우저 A에는 새 세션이 발급됨
- 브라우저 B의 변경 전 세션은 `401`

## 10. 계정 간 읽기 격리

1. A로 로그인해 A_PLAN_ID를 확인합니다.
2. B로 로그인해 같은 주소를 요청합니다.

```js
fetch('/api/tasks?planId=A_PLAN_ID').then(async r => [r.status, await r.json()])
```

통과 모습: `404`, A의 내용 0건 노출.

반대 방향 B → A도 동일하게 확인합니다.

## 11. 계정 간 수정 격리

A가 만든 A_TASK_ID와 A_PLAN_ID를 사용합니다. B 로그인 상태에서:

```js
fetch('/api/tasks', {
  method: 'PATCH',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    taskId: 'A_TASK_ID',
    planId: 'A_PLAN_ID',
    title: '권한 테스트',
    description: '',
    dueDate: '2026-10-10',
    priority: 'medium',
    tag: '',
    estimatedMinutes: 30
  })
}).then(async r => [r.status, await r.json()])
```

통과 모습: `404`.

반대 방향도 확인합니다.

## 12. 계정 간 삭제 격리

B 로그인 상태에서 A_TASK_ID를 대상으로:

```js
fetch('/api/tasks?taskId=A_TASK_ID', {method:'DELETE'})
  .then(async r => [r.status, await r.json()])
```

통과 모습: `404`.

거절 전후 A 계정의 자료 건수가 변하지 않았는지 확인합니다.

## 13. 사용자 식별자 변조 / 목록 격리

B 로그인 상태에서 URL·헤더·본문에 A의 사용자 ID처럼 보이는 값을 추가해도 서버는 세션 사용자만 사용해야 합니다.

예:

```js
fetch('/api/tasks?userId=A_USER_ID', {
  headers: {'X-User-ID':'A_USER_ID'}
}).then(async r => [r.status, await r.json()])
```

통과 모습:
- `200`
- 응답 목록에는 B의 자료만 존재
- A 자료는 0건

## 14. 비로그인 직접 요청

로그아웃 상태에서:

```js
fetch('/api/tasks').then(async r => [r.status, await r.json()])
```

통과 모습: `401`.

## 15. 로그인 실패 보호

존재하는 시험 계정으로 틀린 비밀번호를 5회 연속 입력합니다.

통과 모습:
- 이후 잠금 응답 `429`
- 10분 잠금

주의: 이 기능은 계정 존재 여부 비교 증거와 섞지 않습니다. C99의 동일 문구 증거는 잠금 전 1회 실패 기준으로 남깁니다.

## 16. 실제 5일 기록

`결과 보기 → 하루 기록`에서 **Asia/Seoul 기준 서로 다른 실제 날짜 정확히 5일** 기록합니다.

DAY 1에 고정되는 값:
- 질문: `하루 동안 계획한 일에 실제로 몇 분을 사용했는가?`
- 지표: `실제 작업 시간`
- 단위: `분`

계산 규칙:
- 누락: 해당 날짜 작업 기록이 없으면 `0분`
- 중복: 같은 날짜의 하루 기록은 한 행만 유지하고 다시 저장하면 갱신
- 이상치: 임의로 버리지 않고 저장된 작업 기록 값을 그대로 합산
- 반올림: 시작/종료 시각 차이를 가장 가까운 정수 `분`으로 반올림
- 주 시작 요일: 월요일
- 날짜 귀속: 작업 기록의 `started_at`을 Asia/Seoul 날짜로 변환해 그 날짜에 합산

`database/verification.sql` V-06/V-07에서 `distinct_date_count`, 합계, 평균, 고정 질문/지표/단위를 확인합니다.

## 17. DAY 2 뒤 / DAY 3 전 계획 기준 1회 변경

순서:

```text
DAY 1 기록
DAY 2 기록
→ 계획 기준 수정 1회
DAY 3 기록
DAY 4 기록
DAY 5 기록
```

기준 수정 시 반드시:
- 변경 전 기준
- 변경 후 기준
- 변경 이유
- 변경 시각

이 저장됩니다.

통과 확인:
- DAY 1 이전 또는 DAY 3 이후가 아니라 **기록이 정확히 2개일 때만** 변경 가능
- 변경은 사용자당 1회만 가능
- 질문/지표/단위/계산 규칙은 변경 전후 동일

`database/verification.sql` V-08도 함께 캡처합니다.

## 18. 5일 합계 / 평균 수기 대조

화면의 `작업 시간 합계`와 `하루 평균`을 5개 `metric_value`로 직접 계산합니다.

```text
합계 = D1 + D2 + D3 + D4 + D5
평균 = round(합계 / 5)
```

화면과 수기 계산 결과가 같은지 기록합니다.

## 19. 내보내기

설정 → `내 데이터 내보내기`를 실행합니다.

확인:
- JSON 파일 하나 다운로드
- plans / planVersions / tasks / statusEvents / executionLogs / reviews / dailyRecords / ruleChange 포함
- password_hash, session token, token_hash 미포함

## 20. 계정 삭제

시험 계정으로 확인합니다.

화면에 `계정을 삭제하면 내 계획과 기록도 함께 삭제됩니다.` 안내가 표시되는지 캡처합니다.

삭제 후:
- 로그인 불가
- 해당 사용자의 plans/daily_records 등이 cascade 삭제됐는지 DB에서 확인

## 21. 비밀값 최종 점검

저장소 루트에서:

```bash
grep -RInE "DATABASE_URL=|postgresql://|service_role|pds_session=" . \
  --exclude-dir=.git --exclude-dir=node_modules
```

허용:
- `.env.example`의 가짜 `USER:PASSWORD@HOST` 예시
- README/가이드의 가짜 예시 또는 검색 명령 자체

금지:
- 실제 DB host/user/password
- 실제 세션 원문
- 실제 비밀번호
- API secret key

## 22. 제출문 마지막 2개

### 짧은 확인 방법 4줄

1. 어디로 가나요
2. 세 단계 안에 무엇을 하나요
3. 무엇이 보이면 통과인가요
4. 안 될 때 무엇이 보이나요

### AI와 내 판단 3줄

`docs/AUTH_DESIGN.md`의 ⑤를 실제 작업에 맞게 최종 확인해 작성합니다.
