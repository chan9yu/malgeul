import type { PipelineFailure } from '../services';
import { AudioExtractionError, TranscriptionError } from '../services';

export const FAILURE_MESSAGE: Record<PipelineFailure, string> = {
	FILE_READ: '파일을 읽지 못했습니다. 파일이 옮겨지거나 지워졌을 수 있습니다',
	DECODE: '이 파일에서 음성을 찾지 못했습니다',
	EMPTY_AUDIO: '이 파일에서 음성을 찾지 못했습니다',
	RESAMPLE: '음성을 추출하지 못했습니다. 영상이 길어 메모리가 모자랐을 수 있습니다',
	MODEL_PREPARE:
		'음성 인식 모델을 준비하지 못했습니다. 네트워크 연결을 확인하고 브라우저를 최신 버전으로 올린 뒤 다시 시도해 주세요',
	TRANSCRIBE: '음성을 텍스트로 바꾸는 중 실패했습니다',
	UNKNOWN: '변환 중 알 수 없는 문제가 생겼습니다'
};

/** 파이프라인은 두 에러 클래스만 던진다. 그 밖의 예외는 단계를 가려낼 수 없어 UNKNOWN이 된다 */
export function toFailureCode(cause: unknown): PipelineFailure {
	if (cause instanceof AudioExtractionError) {
		return cause.failure;
	}

	if (cause instanceof TranscriptionError) {
		return cause.failure;
	}

	return 'UNKNOWN';
}
