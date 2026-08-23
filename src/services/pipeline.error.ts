import type { PipelineFailure } from './types';

/** 파이프라인이 던지는 에러의 상위 클래스. 단계를 가리지 않고 실패 코드를 꺼낼 때 이것으로 검사한다 */
export class PipelineError extends Error {
	readonly failure: PipelineFailure;

	constructor(message: string, failure: PipelineFailure, cause?: unknown) {
		super(message, { cause });
		this.name = 'PipelineError';
		this.failure = failure;
	}
}
