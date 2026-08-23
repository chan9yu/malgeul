import { PipelineError } from './pipeline.error';
import type { TranscriptionFailure } from './types';

export class TranscriptionError extends PipelineError {
	constructor(failure: TranscriptionFailure, cause?: unknown) {
		super(`transcription failed: ${failure}`, failure, cause);
		this.name = 'TranscriptionError';
	}
}
