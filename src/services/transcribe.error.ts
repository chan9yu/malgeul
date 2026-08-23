import type { TranscriptionFailure } from './types';

export class TranscriptionError extends Error {
	readonly failure: TranscriptionFailure;

	constructor(failure: TranscriptionFailure, cause?: unknown) {
		super(`transcription failed: ${failure}`, { cause });
		this.name = 'TranscriptionError';
		this.failure = failure;
	}
}
