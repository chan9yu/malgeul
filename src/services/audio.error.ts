import type { AudioExtractionFailure } from './types';

export class AudioExtractionError extends Error {
	readonly failure: AudioExtractionFailure;

	constructor(failure: AudioExtractionFailure, cause?: unknown) {
		super(`audio extraction failed: ${failure}`, { cause });
		this.name = 'AudioExtractionError';
		this.failure = failure;
	}
}
