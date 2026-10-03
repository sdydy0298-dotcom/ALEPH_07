# T07 v1.0.0 최종 정적 검수 결과

검수 기준: T07 요구사항 체크리스트 68개 + 제출 체크리스트 20개.

이 문서는 **소스/문서 정적 검수 결과**입니다. 실제 Vercel/Supabase 환경에서만 확인 가능한 항목과 실제 5일이 필요한 항목은 통과로 단정하지 않습니다.

## 최종 판정

| 범위 | 정적 상태 | 남은 실제 확인 |
| --- | --- | --- |
| CARD 1 인증 선택·기본 흐름 | 구현/문서 준비 | 실제 가입·로그인·로그아웃, 중복 가입, T06 자료 이관 |
| CARD 2 비밀번호 보호 | 구현/문서 준비 | 실제 DB bcrypt 값, 같은 비밀번호 두 계정 salt 차이, Network/로그 캡처 |
| CARD 3 세션 | 구현/문서 준비 | HttpOnly/8시간 만료/로그아웃·비밀번호 변경 후 세션 무효화 실제 확인 |
| CARD 4 계정 격리 | 소스상 소유권 검사 확인 | A/B 양방향 읽기·수정·삭제·목록 격리 실제 요청 증거 |
| CARD 5 인증 설명서 | ①~⑥ 문서 구조 준비 | ④의 실제 성공/거절 결과와 캡처 파일명 입력 |
| CARD 5 실제 5일 | 규칙/DB/API/UI 준비 | 서로 다른 실제 Asia/Seoul 날짜 5일 사용 |
| 합계·평균 | 계산 코드 준비 | 실제 5일 값을 손으로 계산해 화면과 대조 |
| 내보내기/계정 삭제 | 구현 확인 | 배포 환경에서 실제 파일/삭제 확인 |
| 공개 URL | 소스 준비 | Vercel/GitHub 새 시크릿 창 확인 |
| T06 연속성 | 적용 절차/이관 SQL 준비 | 실제 T06 결과 URL 명시 + T06 Full Commit 조상 관계 확인 |

## 이번 검수에서 수정한 결함

1. `api/tasks.js`가 존재하지 않는 `plans.title`을 조회하던 문제를 수정했습니다. 현재 계획 제목은 `plan_versions`의 현재 버전에서 가져옵니다.
2. `api/executions.js`에서 다른 계정의 planId 조회가 빈 `200`이 될 수 있던 흐름을 `404`로 통일했습니다.
3. 작업 시간은 클라이언트의 `actualMinutes` 값을 신뢰하지 않고 서버가 시작/종료 시각 차이로 직접 계산합니다.
4. 비밀번호 변경/계정 삭제 폼에 `method="post"`를 추가해 JavaScript 오류 시 URL query string으로 비밀번호가 실릴 가능성을 줄였습니다.
5. 기존 T06 `plans.user_id IS NULL` 자료를 본인 T07 계정으로 연결하는 `database/migrate_t06_owner.sql`을 추가했습니다.
6. 5일 기록 계산 규칙에 누락·중복·이상치·반올림·주 시작요일을 모두 명시하고 DB에 동일 규칙을 저장하도록 정리했습니다.
7. `contracts/pds-schema-v2.json`을 현재 daily record 필드와 맞췄습니다.
8. 인증 구현 설명서를 요구사항의 ①~⑥ 구조로 다시 작성했습니다.
9. README의 내부 prototype 버전 이력을 제거하고 공개 버전을 `v1.0.0`으로 통일했습니다.
10. `package.json` 버전을 `1.0.0`으로 변경하고 `bcryptjs 3.0.2`, `pg 8.16.3`을 정확한 버전으로 고정했습니다.
11. 운영 배포본에서 LOCAL PREVIEW, 샘플 계정, 샘플 계획·할 일·작업 기록·하루 기록과 관련 분기 코드를 모두 제거했습니다.

## 정적 검사 통과

- 모든 `script.js`, `api/*.js`, `api/_lib/*.js` Node syntax 검사 통과
- `package.json`, `vercel.json`, `contracts/pds-schema-v2.json` JSON parse 통과
- HTML duplicate id 0건
- 로그인/회원가입/비밀번호 변경/계정 삭제 폼 POST 확인
- JavaScript가 참조하는 정적 DOM id 누락 0건
- `innerHTML` 사용 0건
- API에서 잘못된 `plans.title` 참조 0건
- 내부 prototype 버전 라벨의 공개 문서 잔존 0건
- 일반적인 GitHub/OpenAI/Google API key 및 private key 패턴 0건
- 실제 PostgreSQL 접속 문자열 0건
- LOCAL PREVIEW/샘플 계정/샘플 데이터 코드 0건

## 제출 전 반드시 사람이 해야 하는 항목

1. T06 저장소의 `.git` 이력을 보존한 작업 폴더에 이 v1.0.0 파일을 덮어쓰기
2. `database/schema.sql` 실행
3. Vercel `DATABASE_URL` 확인 및 배포
4. 본인 T07 계정 생성 후 `database/migrate_t06_owner.sql`로 T06 자료 이관
5. `docs/T07_EVIDENCE_GUIDE.md`의 계정 A/B 검증 실행
6. 실제 날짜 DAY1~DAY5 기록
7. DAY2 뒤 / DAY3 전 계획 기준 1회 변경
8. 합계/평균 수기 대조
9. 내보내기 파일 생성 및 시험 계정 삭제 확인
10. 결과물 URL/GitHub URL 새 시크릿 창 확인
11. T06 최종 결과 URL을 제출문에 명시
12. `git merge-base --is-ancestor <T06_FULL_COMMIT> HEAD` 결과 0 확인
13. 제출문 확인 방법 4줄과 AI/내 판단 3줄 작성

## 결론

**GitHub에 올릴 소스 후보로는 정리 완료**입니다. 다만 실제 배포·두 계정·실제 5일·Git 조상 관계 증거가 없으므로 T07 요구사항 전체를 현재 시점에 100% 통과했다고 판정할 수는 없습니다.
