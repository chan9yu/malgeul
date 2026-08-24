# CONTRIBUTING

말글 개발에 참여할 때 지키는 것을 적는다.

## 개발 환경

Node 24 이상과 pnpm 11 이상이 필요하다. Node 버전은 `.nvmrc`에 적혀 있다.

## 설치와 실행

```bash
pnpm install   # 의존성 설치. lefthook Git 훅이 함께 설치된다
pnpm dev       # 개발 서버
pnpm build     # 타입 검사와 프로덕션 빌드
pnpm preview   # 빌드 결과 미리 보기
```

## 브랜치 전략

- `main`은 항상 빌드가 되어야 하고 직접 커밋하지 않는다. 설정과 문서, 초기 셋업은 예외로 바로 커밋해도 된다
- 기능 작업은 `feature/{이름}`으로 분기한다. 이름은 영문 케밥 케이스로 쓴다. 예를 들어 `feature/product-filter`다
- 머지는 `--no-ff`로 한다. 작업 단위가 머지 커밋으로 묶여 이력에 남는다
- 머지 후 feature 브랜치는 삭제한다

## 커밋 컨벤션

커밋 메시지는 `<타입>: <제목>` 형식으로 쓴다. 타입은 소문자 영문, 제목은 한국어 50자 이내다. 메시지 골격은 `scripts/commit-template.txt`에 있고 커밋할 때 메시지가 비어 있으면 자동으로 채워진다.

| 타입     | 용도                                |
| -------- | ----------------------------------- |
| feat     | 새로운 기능                         |
| fix      | 버그 수정                           |
| docs     | 문서 변경                           |
| style    | 코드 포맷팅 (세미콜론, 들여쓰기 등) |
| refactor | 코드 리팩토링                       |
| perf     | 성능 개선                           |
| test     | 테스트 추가/수정                    |
| chore    | 빌드, 설정 변경                     |

제목과 본문 사이에 빈 줄을 넣고 본문은 72자마다 줄바꿈한다. 본문에는 어떻게보다 무엇을 왜 했는지 쓴다. 성격이 다른 변경(기능과 설정, 포맷)은 한 커밋에 섞지 않는다.

## 머지 전 검사

아래 다섯이 전부 통과해야 `main`으로 머지한다. 빠른 실패 순서로 적었다. 타입 검사가 가장 싸고 lint 피드백이 가장 늦다.

```bash
pnpm type:check    # TypeScript 타입 검사
pnpm build         # 타입 검사와 프로덕션 빌드
pnpm test          # Vitest
pnpm lint          # ESLint
pnpm format:check  # Prettier 포맷 검사
```

통과시키려고 테스트를 건너뛰거나 lint 규칙을 끄지 않는다. 그것은 검사를 통과한 것이 아니라 검사를 치운 것이다.

lefthook이 커밋 시점에 lint와 포맷 검사를, 푸시 시점에 타입 검사를 돌린다. build와 test는 손으로 돌린다. GitHub Actions도 `main` 푸시마다 같은 검사를 다시 돌리고, 거기서는 `build`의 `tsc -b`가 타입 검사를 겸한다.

## 브라우저가 있어야 하는 검증

오디오 디코딩과 WebGPU는 node에도 jsdom에도 없어서 게이트가 덮지 못한다. 그 자리는 `scripts/qa/`의 스크립트가 실제 Chrome을 띄워 확인한다. 목록과 실행 순서는 `.agents/skills/qa-gates/SKILL.md`에 있다.

이 스크립트 가운데 종단 확인과 오디오 측정은 `_workspace/fixtures/` 아래의 영상 파일을 읽는다. 이 폴더는 `.gitignore`에 있어 clone한 저장소에는 없다. 직접 만들어 채워야 돌아간다. 필요한 파일은 mp4 모노 음성과 mp4 한국어 음성, mov 스테레오 음성, 오디오 트랙이 없는 mp4 넷이다.
