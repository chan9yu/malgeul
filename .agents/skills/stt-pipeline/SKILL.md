---
name: stt-pipeline
description: 말글의 오디오 추출과 음성 인식, 자막 생성 구현 지식. OfflineAudioContext 디코딩, 16kHz 리샘플링, transformers.js Whisper 실행, WebGPU, 모델 캐시, 진행률, txt와 srt, vtt 생성기를 만들거나 고치는 작업이면 반드시 이 스킬을 읽는다. 화면 컴포넌트나 CSS 작업은 ui-conventions가 담당한다.
---

# stt-pipeline

영상 파일에서 타임스탬프 붙은 한국어 문장 목록을 뽑는 파이프라인의 구현 지식이다. 무엇이 어떻게 동작해야 하는지의 정본은 `docs/product/SPEC.md`다. 여기에는 정본에 없는 구현 기법과 함정만 적는다.

## 구조 원칙

파이프라인은 React에 의존하지 않는 순수 TypeScript 모듈로 만든다. ROADMAP의 첫 두 마일스톤이 정식 화면 없이 임시 개발 페이지에서 파이프라인만 검증하는 구조라서, UI와 얽히면 이 검증이 불가능하다. 진행 상태는 콜백이나 이벤트로 밖에 알리고 DOM을 직접 만지지 않는다.

공개 타입(변환 구간, 진행 이벤트)은 구현 전에 정하고 ui-dev와 합의한다. 합의된 타입이 담긴 코드 파일이 계약이다.

## 오디오 추출

OfflineAudioContext만 쓴다. ffmpeg.wasm을 붙이지 않는 이유는 SPEC 기술 결정 기록에 있다.

```ts
const bytes = await file.arrayBuffer();
const probe = new OfflineAudioContext(1, 1, 16000);
const decoded = await probe.decodeAudioData(bytes); // 컨텍스트 샘플레이트(16kHz)로 리샘플링된 AudioBuffer. 채널 수는 원본 그대로
const target = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
const source = target.createBufferSource();
source.buffer = decoded;
source.connect(target.destination);
source.start();
const rendered = await target.startRendering(); // 16kHz 모노
const pcm = rendered.getChannelData(0); // Float32Array, Whisper 입력
```

함정들:

- `decodeAudioData`는 컨텍스트의 샘플레이트로 리샘플링해서 돌려준다. probe 컨텍스트를 16000으로 잡았으니 디코딩 결과가 이미 16kHz다. 같은 mov 파일을 16000 컨텍스트와 48000 컨텍스트에서 디코딩해 각각 148,346프레임과 445,040프레임이 나오는 것으로 확인했다. 다만 채널 수는 원본 그대로(스테레오면 2채널) 남으므로 모노로 만드는 두 번째 렌더 단계가 여전히 필요하다
- 스테레오는 1채널 destination에 연결하면 자동으로 다운믹스된다. 채널 병합 코드를 따로 쓰지 않는다
- 메모리가 병목이다. 위 함정대로 probe 컨텍스트를 16000으로 잡으면 디코딩 결과가 이미 16kHz라 최악이 크게 줄어든다. 2시간 스테레오가 Float32로 약 921MB다(7200초 곱하기 16000 곱하기 4바이트 곱하기 2채널). 그래도 작지 않으니 리샘플링이 끝나면 `decoded` 참조를 버린다. `bytes`는 `decodeAudioData`가 detach하므로 따로 버리지 않아도 된다. ROADMAP에 30분 이상 영상으로 메모리를 확인하는 항목이 있는 이유다
- `decodeAudioData`는 넘긴 ArrayBuffer를 detach한다. 같은 버퍼를 두 번 쓸 수 없다
- 오디오 트랙이 없거나 해독 불가면 `decodeAudioData`가 거부된다. 이 거부를 잡아 SPEC의 실패 처리로 잇는다. 임의로 재시도하지 않는다

## 음성 인식

transformers.js로 Whisper를 돌린다. 모델은 whisper-large-v3-turbo 양자화(약 600MB), 실행은 WebGPU다.

**API를 지어내지 않는다.** transformers.js는 버전마다 옵션 이름과 dtype 조합이 다르다. 구현 전에 설치된 버전의 문서나 타입 정의를 확인하고, 모델의 정확한 저장소 이름은 Hugging Face의 onnx-community에서 whisper-large-v3-turbo ONNX 변환본을 확인해 쓴다. 지금 쓰는 값은 `model.config.ts`에 모여 있다.

- device는 webgpu, dtype은 문자열 `q4f16` 하나다. 실제로 받는 양은 약 563MB이고 화면 문구는 이것을 올려 600MB로 적는다
- 다운로드 진행률: pipeline 생성의 progress_callback으로 파일별 loaded와 total이 온다. 여러 파일이 오므로 합산해서 SPEC의 "312MB / 600MB" 표기를 만든다
- 구간과 시각: return_timestamps 옵션으로 구간별 시작과 끝 시각을 받는다. 한국어는 language를 korean으로 고정하고 task는 transcribe다. 언어 자동 감지에 맡기면 초반 무음 구간에서 오판할 수 있다

모델 캐시는 transformers.js가 기본으로 브라우저 Cache API에 저장한다. 재방문 판정을 따로 만들지 말고, 캐시가 있으면 progress_callback의 다운로드 이벤트 없이 로드가 끝나는 동작을 그대로 쓴다.

### 창을 두 겹으로 나눈다

Whisper 자체가 30초 창으로 본다. 그것은 `chunk_length_s`와 `stride_length_s`로 라이브러리에 맡긴다. 지금 stride 는 3이다. 5에서 3으로 내리면 조각이 24초씩 전진해 같은 오디오를 덜 인코딩한다. 2까지 내리면 경계를 이어 붙일 때 쓰는 겹침이 4초뿐이라 쓰지 않는다.

그 바깥에 창을 하나 더 두고 PCM을 잘라 넣는다. 라이브러리가 변환 도중에 아무 진행 신호도 주지 않기 때문이다. 한 번에 다 넘기면 두 시간짜리 영상에서 진행률이 0에 멈춰 있다가 100으로 뛴다. 바깥 창 하나가 진행률 한 칸이다.

바깥 창은 앞뒤로 5초씩 겹쳐 모델에 넘기고 결과는 겹치지 않는 core 범위만 취한다. 겹침이 없으면 창 경계에 걸친 말이 양쪽에서 잘린다. `transcribe.window.ts`의 `planWindows`가 범위를 만들고 `mergeWindows`가 상대 시각을 절대 시각으로 옮기며 합친다.

**바깥 창 길이를 손으로 정하지 않는다.** `alignedWindowSeconds`가 영상 길이에서 뽑는다. 창에 겹침을 더한 길이가 `30 + k*전진폭`이면 조각이 남김없이 떨어지는데, 이 조건을 깨면 조각이 하나씩 더 생겨 이득이 통째로 사라진다. 80.1분 파일에서 stride 3에 창 120초를 쓰면 기준 대비 0.996으로 거의 아무것도 못 얻는다. 창을 키우는 것보다 맞아떨어지게 잡는 것이 중요하다. 맞아떨어진 뒤로는 곡선이 금방 평평해져서 창 140초가 창 284초 이득의 92퍼센트를 가져간다(59분 파일에서는 93퍼센트).

### 무음 건너뛰기

`audio.silence.ts`의 `findSilenceGaps`가 에너지로 무음을 찾고 `planWindows`가 그 위에 창을 깐다. 웹용 VAD 구현이 CDN 로드를 기본으로 해서 밖으로 나가는 요청을 모델 다운로드 하나로 묶는 제약과 어긋나 직접 잰다.

**문턱값을 하나로 고정하면 안 된다.** 구간이 갈릴 때마다 그 구간의 마지막 창이 덜 찬 채로 끝나고 겹침 10초가 새로 붙어 오히려 조각이 늘 수 있다. 말이 30초씩 끊기는 내용에서 3초 기준으로 건너뛰면 1.42배 느려진다. 값이 말 구간 길이에 따라 오르내려서 어떤 고정값도 빨라진다고 보장하지 못한다. 그래서 후보 넷을 세워 조각이 가장 적은 계획을 고른다.

조용한 말을 지우는 것이 최악의 실패다. 말과 잡음 바닥이 충분히 안 갈리면 아무것도 건너뛰지 않는 안전 장치가 있다. 이 장치를 검사할 때 합성 PCM의 무음 구간에 잡음을 안 넣으면 장치가 한 번도 판정되지 않은 채 통과한다.

### 비용은 조각 수가 아니다

조각 하나가 늘 30초로 패딩되어 인코딩되므로 **인코더** 비용만 조각 수에 비례한다. 디코더는 그렇지 않다. 80.1분 파일에서 조각을 16퍼센트 줄였는데 시간은 4.7퍼센트만 줄었다.

**시간 수치를 한 번 잰 값으로 믿지 않는다.** 같은 파일을 같은 코드로 다시 재니 450초가 420초로 나왔다. 무작위 흔들림이 아니다. 창 23개 가운데 22개가 같은 방향으로 빨라졌고 창별 짝 비교의 표준오차가 1.2퍼센트다. 두 측정 사이에 체계적인 차이가 있었고 원인은 안 쟀다.

그래서 반복해서 평균 내는 것으로는 안 풀린다. 조건을 번갈아 재고(A/B/A/B) 창별로 짝짓는다. **측정 한 번이 창 23개를 주므로 짝지으면 전체 시간만 보는 것보다 훨씬 정밀하다.**

실측으로 인코더가 25에서 37퍼센트, 디코더가 63에서 75퍼센트다. 무음이 갈라 놓은 자리에 생긴 조각 하나짜리 창이 818ms 였고 조각당 평균이 2230ms 였다. 조각 수만 보고 이득을 계산하면 크게 빗나간다.

### 게이트가 못 잡는 함정

전부 타입 검사와 lint, 테스트를 모두 통과하면서 틀린다. 실제로 겪은 것만 적는다.

**dtype 키를 틀리면 조용히 3GB를 받는다.** dtype에 객체를 주려면 키가 파일 이름이 아니라 세션 이름이어야 한다. 인코더의 세션 이름은 `encoder_model`이 아니라 `model`이다. 키가 맞지 않으면 예외가 나지 않고 fp32로 떨어져 600MB 대신 3GB를 받는다. 문자열 하나로 주면 이 실수 자체가 생기지 않는다.

**wasm이 CDN에서 온다.** transformers.js는 불러오는 순간 `env.backends.onnx.wasm.wasmPaths`를 jsdelivr 주소로 채운다. 비워 두면 onnxruntime-web이 번들러가 함께 내보낸 같은 출처의 wasm을 쓴다. 그대로 두면 모델을 다 받은 뒤 23MB짜리 wasm이 밖에서 온다. 개발 서버는 `node_modules`에서 직접 서브해 이 결함을 가린다. 프로덕션 빌드로만 보인다.

**말 구간이 갈리면 문장이 조용히 사라진다.** `mergeWindows`는 창의 core 를 넘긴 문장을 마지막 창에서만 살린다. 무음을 건너뛰어 창이 떨어져 놓이면 **말 구간마다** 그 처리가 필요하다. 안 그러면 구간 끝에 걸친 문장이 어느 창의 core 에도 안 들어가 없어진다. 다음 창의 core 가 이 창의 core 끝보다 뒤에서 시작하는지로 구간 끝을 가린다. 검사를 만들면 고치기 전 동작으로 되돌려 실제로 문장이 사라지는지 먼저 본다.

**에러 상세는 `message` 가 아니라 `cause` 에 있다.** `TranscriptionError` 는 `message` 를 `transcription failed: ${failure}` 로 만들고 받은 내용을 표준 `cause` 에 넣는다. 진단할 때 `.message` 를 읽으면 실패 코드만 되풀이되고 ONNX 런타임이 던진 원문이 사라진다. `cause.cause` 까지 읽어야 한다.

**진행 이벤트가 초당 수백 개 온다.** progress_callback은 청크마다 부른다. 손대지 않으면 다운로드 한 번에 만 건이 넘는다. 화면이 표시하는 단위는 MB이므로 MB 값이 바뀔 때만 내보낸다. 거르는 자리는 워커 안이다. 메인 스레드에서 거르면 postMessage 비용은 이미 다 낸 뒤다.

## Web Worker

모델 로드와 인식은 메인 스레드를 수 분간 막으므로 Web Worker에서 돌린다. Vite에서는 `new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' })` 형태로 만든다. Worker와 메인 사이의 메시지 shape도 공개 타입의 일부이고 `transcribe.messages.ts`에 있다. PCM Float32Array는 postMessage의 transfer 목록에 넣어 복사 없이 넘긴다.

워커 파일에서는 DOM 타입을 쓸 수 없다. DOM과 WebWorker lib을 함께 켜지 못해서 워커 전역 가운데 실제로 쓰는 것만 인터페이스로 적어 두고 쓴다.

## 내보내기 생성기

txt와 srt, vtt 생성기는 구간 배열을 받아 문자열을 돌려주는 순수 함수로 만든다. SPEC의 출력 예시가 곧 기대 출력이니 고정 입력을 넣어 예시와 문자 단위로 비교해 확인한다.

시각 표기가 형식마다 다르다. 세 형식과 화면 목록이 쓰는 계산은 `utils/timecode.ts` 한 곳에 모아 둔다. 같은 산술을 두 번 적으면 한쪽만 고치게 된다:

- txt: 1시간 미만 영상은 `mm:ss`, 1시간 이상은 `h:mm:ss`. 기준은 구간이 아니라 영상 길이다
- srt: `HH:MM:SS,mmm` 형식에 밀리초를 쉼표로. 자막 번호는 1부터
- vtt: 첫 줄 `WEBVTT`, 밀리초를 마침표로

파일 이름은 원본 영상 이름에서 확장자만 바꾸고 인코딩은 UTF-8이다.

## 실패 코드와 에러 계층

파이프라인이 던지는 에러는 전부 `PipelineError`를 상속한다. 여기에 `failure` 필드로 SPEC의 실패 코드가 붙는다. 소비자는 단계를 가리지 않고 이 상위 클래스 하나로 검사해 코드를 꺼낸다.

단계별 하위 클래스로 `AudioExtractionError`와 `TranscriptionError`가 있다. 던지는 자리에서 무엇이 터졌는지 이름으로 보이라고 남긴 것이다. 받는 쪽에서 둘을 갈라 보지는 않는다.

에러 메시지는 영어로 쓴다. 이 메시지는 개발자용이라 화면에 나가지 않는데, 한국어로 적어 두면 어쩌다 새어 나갔을 때 그럴듯해 보여 아무도 알아채지 못한다. 화면 문구는 SPEC의 실패 문구 표에서 코드로 고른다.
