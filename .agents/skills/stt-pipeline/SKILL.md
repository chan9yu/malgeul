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

**API를 지어내지 않는다.** transformers.js는 버전마다 옵션 이름과 dtype 조합이 다르다. 구현 전에 설치된 버전의 문서나 타입 정의를 확인하고, 모델의 정확한 저장소 이름은 Hugging Face의 onnx-community에서 whisper-large-v3-turbo ONNX 변환본을 확인해 쓴다.

확인이 필요한 지점들:

- pipeline 생성 옵션: device를 webgpu로, dtype은 인코더와 디코더 조합을 버전 문서에서 확인
- 다운로드 진행률: pipeline 생성의 progress_callback으로 파일별 loaded와 total이 온다. 여러 파일이 오므로 합산해서 SPEC의 "312MB / 600MB" 표기를 만든다
- 구간과 시각: return_timestamps 옵션으로 구간별 시작과 끝 시각을 받는다. 한국어는 language를 korean으로 고정하고 task는 transcribe다. 언어 자동 감지에 맡기면 초반 무음 구간에서 오판할 수 있다
- 긴 오디오: Whisper는 30초 창으로 처리한다. chunk_length_s와 stride 옵션으로 라이브러리가 나눠 처리하게 하고, 변환 진행률은 처리를 마친 시간을 전체 길이로 나눠 만든다

모델 캐시는 transformers.js가 기본으로 브라우저 Cache API에 저장한다. 재방문 판정을 따로 만들지 말고, 캐시가 있으면 progress_callback의 다운로드 이벤트 없이 로드가 끝나는 동작을 그대로 쓴다.

## Web Worker

모델 로드와 인식은 메인 스레드를 수 분간 막으므로 Web Worker에서 돌린다. Vite에서는 `new Worker(new URL('./stt.worker.ts', import.meta.url), { type: 'module' })` 형태로 만든다. Worker와 메인 사이의 메시지 shape도 공개 타입의 일부다. PCM Float32Array는 postMessage의 transfer 목록에 넣어 복사 없이 넘긴다.

## 내보내기 생성기

txt와 srt, vtt 생성기는 구간 배열을 받아 문자열을 돌려주는 순수 함수로 만든다. SPEC의 출력 예시가 곧 기대 출력이니 고정 입력을 넣어 예시와 문자 단위로 비교해 확인한다.

시각 표기가 세 형식이 서로 다르다는 점이 이 생성기의 전부다:

- txt: 1시간 미만 영상은 `mm:ss`, 1시간 이상은 `h:mm:ss`. 기준은 구간이 아니라 영상 길이다
- srt: `HH:MM:SS,mmm` 형식에 밀리초를 쉼표로. 자막 번호는 1부터
- vtt: 첫 줄 `WEBVTT`, 밀리초를 마침표로

파일 이름은 원본 영상 이름에서 확장자만 바꾸고 인코딩은 UTF-8이다.
