# 기존 T06 저장소에서 T07 v1.0.0 시작하기

T07은 새 GitHub 저장소를 만들어도 되지만 **Git 이력은 T06에서 이어져야 합니다.** 새 폴더에서 `git init`을 다시 하면 T07-C78을 만족할 수 없습니다.

## 1. T06 최종 commit 고정

기존 T06 저장소에서:

```bash
git status
git log -1 --format=%H
```

출력된 40자리 Full Commit ID를 별도로 보관합니다. 작업트리가 깨끗한지도 확인합니다.

## 2. T07용 작업 폴더 만들기

가장 안전한 방법은 **T06 저장소 폴더 전체를 `.git` 포함해서 복사**하는 것입니다.

```text
ALEPH_06  ->  ALEPH_07
```

`ALEPH_07/.git`이 그대로 존재해야 합니다.

## 3. 이 ZIP 덮어쓰기

T07 v1.0.0 ZIP의 내용을 `ALEPH_07` 루트에 덮어씁니다.

주요 항목:

```text
index.html
style.css
script.js
favicon.svg
api/
database/
contracts/
docs/
package.json
vercel.json
.gitignore
.env.example
README.md
```

`.git`은 ZIP에 포함되어 있지 않으며 기존 T06의 것을 그대로 사용합니다.

## 4. T07 GitHub 저장소 연결

GitHub에서 빈 `ALEPH_07` 저장소를 만든 뒤 기존 remote 주소만 바꿉니다.

```bash
git remote -v
git remote set-url origin https://github.com/<USER>/ALEPH_07.git
```

새로 `git init`하지 않습니다.

## 5. 변경 확인

```bash
git status
git diff --stat
```

실제 `.env`, DB 비밀번호, 세션 값이 staging에 들어가지 않았는지 확인합니다.

## 6. Supabase DB 갱신

Supabase SQL Editor에서 `database/schema.sql` 전체를 실행합니다.

이 단계는:
- 기존 T06 테이블 유지
- `plans.user_id` 추가
- 인증 테이블 추가
- T07 5일 기록/규칙 변경 테이블 추가
- 작업 기록 자유 메모 컬럼 추가

를 수행합니다.

## 7. Vercel 환경 변수

Vercel → Settings → Environment Variables:

```text
DATABASE_URL
```

기존 T06 DB를 그대로 사용할 경우 기존 값을 유지합니다. 실제 값은 GitHub에 올리지 않습니다.

## 8. 먼저 배포하고 본인 계정 생성

배포 후:

```text
https://YOUR-SITE.vercel.app/api/health
```

`ok: true`를 확인한 뒤 **본인 T07 계정을 먼저 생성**합니다.

## 9. T06 자료를 본인 계정으로 1회 이관

`database/migrate_t06_owner.sql`을 Supabase SQL Editor에 복사합니다.

SQL Editor 안에서만:

```text
YOUR_EMAIL@example.com
```

을 방금 만든 본인 계정 이메일로 바꿔 실행합니다.

주의:
- 실제 이메일을 저장소의 SQL 파일에 저장하지 않습니다.
- 이관은 `plans.user_id IS NULL`인 기존 T06 계획에만 적용합니다.
- 연결된 할 일/상태 이벤트/작업 기록/돌아보기는 plan 관계를 따라 그대로 유지됩니다.

실행 결과 `legacy_plan_count = 0`인지 확인합니다.

## 10. 실제 기능 검증

`docs/T07_EVIDENCE_GUIDE.md` 순서로 확인합니다.

특히 배포 전에 코드만 보고 통과 처리하면 안 되는 항목:
- 실제 회원가입/로그인/로그아웃
- 계정 A/B 접근 거절
- 세션 만료/무효화
- 실제 5일 기록
- DAY2 뒤 규칙 변경
- 내보내기
- 계정 삭제

## 11. v1.0.0 커밋

검증 전 개발 commit 예시:

```bash
git add .
git commit -m "feat: add PlanDoSee T07 v1.0.0"
git push -u origin main
```

실제 5일 기록은 DB 데이터이므로 5일 경과 자체를 Git commit으로 꾸밀 필요는 없습니다. 제출 직전 문서/증거를 추가했다면 별도 최종 commit을 만들고 그 Full Commit URL을 제출합니다.

## 12. T06 조상 관계 최종 확인

```bash
git merge-base --is-ancestor <T06_FULL_COMMIT> HEAD
echo $?
```

`0`이어야 합니다.

추가 확인:

```bash
git log --oneline --graph --decorate -20
```

T06 최종 commit 뒤에 T07 commit이 이어지는 모습이 보여야 합니다.
