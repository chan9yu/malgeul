export const MODEL_ID = 'onnx-community/whisper-large-v3-turbo';

export const MODEL_DEVICE = 'webgpu';

/**
 * 합쳐서 약 563MB를 내려받는다. 파일마다 다른 값을 주려면 파일 이름이 아니라 세션 이름을 키로 써야
 * 하고, 인코더의 세션 이름은 model이라 키를 틀리면 조용히 fp32로 떨어져 3GB가 된다.
 */
export const MODEL_DTYPE = 'q4f16';

export const TRANSCRIBE_LANGUAGE = 'korean';
export const TRANSCRIBE_TASK = 'transcribe';

/** Whisper가 한 번에 보는 창의 길이. 라이브러리가 이 값으로 조각 안을 다시 나눈다 */
export const WHISPER_CHUNK_SECONDS = 30;
export const WHISPER_STRIDE_SECONDS = 5;

/** transformers.js가 내려받은 파일을 담는 Cache API 이름. 라이브러리 기본값을 그대로 적었다 */
export const MODEL_CACHE_KEY = 'transformers-cache';
