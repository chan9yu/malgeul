/**
 * lite 는 인코더를 저계수 압축한 변형이라 A/B 대조 대상이다. 한국어 품질 자료가 없어 기본은
 * turbo 다. 내려받는 양은 turbo 약 563MB, lite 약 444MB.
 */
export const MODEL_IDS = {
	turbo: 'onnx-community/whisper-large-v3-turbo',
	lite: 'onnx-community/lite-whisper-large-v3-turbo-acc-ONNX'
} as const;

export const MODEL_ID: (typeof MODEL_IDS)[keyof typeof MODEL_IDS] = MODEL_IDS.turbo;

export const MODEL_DEVICE = 'webgpu';

/**
 * 파일마다 다른 값을 주려면 파일 이름이 아니라 세션 이름을 키로 써야 하고, 인코더의 세션 이름은
 * model 이라 키를 틀리면 조용히 fp32 로 떨어져 3GB 가 된다. 문자열 하나면 그 실수가 안 생긴다.
 */
export const MODEL_DTYPE = 'q4f16';

export const TRANSCRIBE_LANGUAGE = 'korean';
export const TRANSCRIBE_TASK = 'transcribe';

/** Whisper 가 한 번에 보는 창의 길이. 라이브러리가 이 값으로 조각 안을 다시 나눈다 */
export const WHISPER_CHUNK_SECONDS = 30;

/**
 * 줄이면 조각이 `30 - 2*stride` 만큼 더 전진해 같은 오디오를 덜 인코딩한다. 다만 경계를 이어
 * 붙일 때 쓰는 겹침이 `2*stride` 라 2 로 내리면 겹침이 4초뿐이다. 그래서 3 이다.
 */
export const WHISPER_STRIDE_SECONDS = 3;

/**
 * 값을 주면 라이브러리가 seek 루프를 건너뛴다. seek 는 모델이 30초를 다 못 옮겼을 때 마지막
 * 완결 구간부터 다시 인코딩해 다시 생성하는 루프인데, 배치로 묶으려면 이 루프가 걸린다.
 * null 이면 지금까지의 순차 경로 그대로다. 동등성 검증 전에는 null 을 유지한다.
 *
 * 쓸 때는 445 로 둔다. 모델의 `max_length` 가 448 이고 시작 토큰이 셋이라(타임스탬프를 켜면
 * `<|notimestamps|>` 가 안 붙는다) seek 의 한 번 통과가 이미 445 로 묶여 있다. 같은 값을 줘야
 * 한 번 통과가 양쪽에서 같아지고 차이의 원인이 seek 반복 하나로 좁혀진다. 더 작게 주면
 * "seek 를 껐더니 문장이 줄었다" 와 "토큰 한도에 걸려 잘렸다" 가 같은 모양으로 보인다.
 * 한도에 닿았는지는 계측의 windowTokenCounts 로 확인한다. 86분 픽스처에서는 최대 136 이었다.
 */
export const TRANSCRIBE_MAX_NEW_TOKENS: number | null = null;

/** transformers.js 가 내려받은 파일을 담는 Cache API 이름. 라이브러리 기본값을 그대로 적었다 */
export const MODEL_CACHE_KEY = 'transformers-cache';
