# 말글

한국어 대화가 담긴 영상(.mp4, .mov)을 올리면 대화 내용을 텍스트로 뽑아 주는 웹사이트다. 모든 처리가 브라우저 안에서 끝나고 영상은 기기 밖으로 나가지 않는다.

이름은 말이 글이 된다는 뜻이다. 제품이 하는 일 그대로다. 저장소와 패키지, 배포 경로에는 로마자 `malgeul`을 쓰고 화면 워드마크는 한글 `말글`로 적는다.

## 특징

- 서버가 없다. 영상에서 음성을 추출하고 텍스트로 바꾸는 과정 전부가 브라우저에서 일어난다
- 타임스탬프 붙은 문장을 클릭하면 영상이 그 시점부터 재생된다
- 결과를 복사하거나 txt와 srt, vtt 파일로 내려받는다
- 지원 브라우저는 데스크톱 Chrome과 Edge 최신 버전이다

## 문서

문서는 성격에 따라 `docs/` 아래 폴더로 나뉜다. 만드는 것은 `docs/product/`에, 보이는 것은 `docs/design/`에, 생성 도구에 넣는 프롬프트는 `docs/prompts/`에 둔다. 무엇을 왜 만드는지는 `docs/product/PRD.md`부터 읽고, 배치 기준과 채우는 순서는 `docs/CLAUDE.md`에 적혀 있다.

## 개발

```bash
pnpm install
pnpm dev           # 개발 서버. 3600 포트
pnpm build         # 타입 검사와 프로덕션 빌드
pnpm test          # Vitest
pnpm lint          # ESLint
pnpm type:check    # 타입 검사만
pnpm format:check  # Prettier 포맷 검사
```

브랜치 전략과 커밋 컨벤션, 머지 전 검사는 [CONTRIBUTING.md](./CONTRIBUTING.md)에 있다.

## 배포

`main`에 푸시하면 GitHub Actions가 게이트를 돌리고 통과한 산출물을 GitHub Pages에 올린다. 설정은 `.github/workflows/deploy.yml`이다.

저장소 이름이 주소에 붙는 프로젝트 페이지라 빌드 `base`를 `/malgeul/`로 잡는다. 이 값이 산출물의 절대 경로 몇 곳을 함께 바꾸므로 바꿀 때는 `docs/product/SPEC.md`의 배포 결정을 먼저 읽는다.

## 라이선스

[MIT](./LICENSE)
