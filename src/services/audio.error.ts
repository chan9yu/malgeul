import { PipelineError } from './pipeline.error';
import type { AudioExtractionFailure } from './types';

export class AudioExtractionError extends PipelineError {
	constructor(failure: AudioExtractionFailure, cause?: unknown) {
		super(`audio extraction failed: ${failure}`, failure, cause);
		this.name = 'AudioExtractionError';
	}
}
