---
description: PR을 머지하고 브랜치를 정리해주세요.
---

# Merge

완료된 feature 브랜치를 `main`으로 머지하고 정리한다.

## 절차

1. 완료 기준 확인. 설계 정합성 리뷰와 QA 통과 여부를 본다. 미충족이면 머지하지 않고 보고한다
2. 머지 경로 결정
   - PR이 있으면: `gh pr merge --merge` (머지 커밋 유지)
   - 원격/PR이 없으면: `git switch main` 후 `git merge --no-ff feature/{name}`
3. 머지 커밋 메시지는 기본 형식 유지 (`Merge branch 'feature/{name}'`)
4. 머지 후 검증. `pnpm check` 통과 확인
5. 브랜치 정리. `git branch -d feature/{name}` (원격 브랜치가 있으면 원격도 삭제)
6. `git log --oneline -5`로 결과 확인

## 규칙

`.agents/rules/git-workflow.md`의 브랜치 전략과 금지 패턴을 따른다.

### 추가 규칙

- 머지는 항상 `--no-ff`로 한다. fast-forward로 브랜치 이력을 지우지 않는다
- 충돌 발생 시 `--ours`/`--theirs` 일방 해소 금지. 양쪽 의미를 검토해 해소하되
  판단이 어려우면 사용자에게 확인
- 머지 후 검증이 실패하면 즉시 보고한다. `main`은 항상 빌드 가능한 상태여야 한다
