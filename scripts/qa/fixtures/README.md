# 픽스처 생성기

브라우저가 필요한 검증 스크립트가 읽는 영상 파일을 만든다. 만들어진 미디어는 `_workspace/fixtures/`에 두고 `.gitignore`에 있어 저장소에 올라가지 않는다. clone한 저장소에는 파일이 없으니 여기서 다시 만든다.

생성기는 macOS 기본 도구만 쓴다. ffmpeg을 설치하지 않아도 된다. 한국어 음성은 `say`의 `Yuna` 목소리로 만든다.

## 무엇이 필요한가

| 파일                    | 쓰는 검증                        | 담는 것                              |
| ----------------------- | -------------------------------- | ------------------------------------ |
| `korean-speech.mp4`     | `verify-downmix`, 손으로 훑기    | 32초, 한국어 음성, 모노              |
| `korean-8channel.mov`   | `verify-downmix`                 | 32초, 8채널. 소리는 채널 1에만       |
| `korean-long-86min.mp4` | 변환 시간과 메모리 측정          | 85.8분, 문장마다 번호                |
| `oversize.mp4`          | 크기 거절 화면                   | 제한 +1바이트. 희소 파일이라 0바이트 |
| `speech-mono.mp4`       | `verify-end-to-end`              | 10초, 모노                           |
| `speech-stereo.mov`     | `verify-end-to-end`              | 10초, 스테레오                       |
| `no-audio.mp4`          | `verify-end-to-end`              | 오디오 트랙 없음                     |
| `korean-short.mp4`      | `verify-end-to-end`, 결과 하네스 | 짧은 한국어 음성                     |

## 만드는 방법

먼저 대본을 쓰고 음성을 만든다.

```bash
mkdir -p _workspace/fixtures /tmp/malgeul-check
cat > /tmp/malgeul-check/lines.txt <<'TXT'
안녕하세요. 오늘 주간 회의를 시작하겠습니다.
지난주에 이야기한 배포 일정부터 확인하겠습니다.
배포는 목요일로 잡는 것이 좋겠습니다.
그 전에 회귀 검사를 한 번 더 돌려야 합니다.
디자인 쪽 확인은 수요일까지 받기로 했습니다.
고객 문의 중에 업로드 오류 건은 원인을 파악했습니다.
지표는 지난주 대비 크게 달라진 점이 없었습니다.
다음 주제로 넘어가기 전에 질문 있으신 분 계신가요?
없으면 오늘 회의는 여기까지 하겠습니다.
모두 수고하셨습니다.
TXT

say -v Yuna -r 175 -f /tmp/malgeul-check/lines.txt -o /tmp/malgeul-check/korean.aiff
```

`say`는 22050Hz로 내보내고 그 샘플레이트로는 AAC 변환이 거부된다. 44100으로 올린다.

```bash
afconvert -f m4af -d 'aac@44100' -c 1 /tmp/malgeul-check/korean.aiff /tmp/malgeul-check/korean-mono.m4a
```

### 한국어 음성 mp4

```bash
swift make-video.swift /tmp/malgeul-check/korean-mono.m4a \
  "$PWD/_workspace/fixtures/korean-speech.mp4" mp4
```

### 8채널 mov

첫 채널을 비우고 채널 1에만 소리를 넣는다. 이 배치라야 다운믹스 결함이 드러난다.

```bash
swift make-multichannel.swift /tmp/malgeul-check/korean.aiff /tmp/malgeul-check/korean-8ch.caf 1
swift make-video.swift /tmp/malgeul-check/korean-8ch.caf \
  "$PWD/_workspace/fixtures/korean-8channel.mov" mov
```

`make-video.swift`가 Passthrough로 내보내므로 채널 수가 그대로 남는다. 재인코딩하면 스테레오로 접혀 결함이 보이지 않는다.

### 긴 한국어 파일

같은 문장을 반복하되 번호를 붙인다. 번호가 있어야 구간이 밀렸는지 결과에서 바로 보인다.

```bash
python3 - <<'PY'
lines = open('/tmp/malgeul-check/lines.txt', encoding='utf-8').read().strip().split('\n')
out = [f'{r * 10 + i + 1}번. {line}' for r in range(113) for i, line in enumerate(lines)]
open('/tmp/malgeul-check/hour.txt', 'w', encoding='utf-8').write('\n'.join(out))
PY

say -v Yuna -r 175 -f /tmp/malgeul-check/hour.txt -o /tmp/malgeul-check/hour.aiff
afconvert -f m4af -d 'aac@44100' -c 1 /tmp/malgeul-check/hour.aiff /tmp/malgeul-check/hour.m4a
cp /tmp/malgeul-check/hour.m4a _workspace/fixtures/korean-long-86min.mp4
```

`.m4a`와 `.mp4`는 같은 컨테이너라 이름만 바꿔도 브라우저가 해독한다. 영상 트랙 없이 오디오만 담는 것은 실제 사용 방식과 같다. 큰 영상은 오디오만 뽑아 넣게 되기 때문이다.

### 크기 제한 경계

제한을 넘는 파일은 크기만 보고 거절되므로 내용이 필요 없다. 희소 파일로 만들면 디스크를 쓰지 않는다.

```bash
python3 -c "
open('_workspace/fixtures/oversize.mp4', 'wb').truncate(1900 * 1024 * 1024 + 1)
"
```

제한 바로 아래의 유효한 파일은 목표 바이트를 넘겨 만든다. 시간이 오래 걸리고 디스크를 2GB 가까이 쓴다.

```bash
swift make-video.swift /tmp/malgeul-check/hour.m4a \
  "$PWD/_workspace/fixtures/at-limit.mov" mov 1985000000
```

### 영상 트랙만 있는 파일과 스테레오

`make-fixtures.swift`와 `make-lr.swift`가 만든다. 둘 다 `/tmp/malgeul-check`에 쓰고 그 안의 `speech.m4a`와 `speech-stereo.m4a`를 먼저 만들어 두어야 한다.

```bash
swift make-fixtures.swift
swift make-lr.swift
cp /tmp/malgeul-check/*.mp4 /tmp/malgeul-check/*.mov _workspace/fixtures/
```

## 확인

만든 뒤에는 채널 수와 길이를 본다. `mdls`는 Spotlight 색인을 타서 방금 만든 파일에는 비어 있을 수 있다.

```bash
afinfo _workspace/fixtures/korean-8channel.mov | head -6
```

그다음 검증 스크립트를 돌려 실제로 쓰이는지 본다.

```bash
node scripts/qa/verify-downmix.mjs
```
