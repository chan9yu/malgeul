import { describe, expect, it } from 'vitest';

import { AudioExtractionError } from './audio.error';

describe('AudioExtractionError', () => {
	it('실패 코드를 보존한다', () => {
		const error = new AudioExtractionError('DECODE');

		expect(error.failure).toBe('DECODE');
		expect(error.name).toBe('AudioExtractionError');
		expect(error).toBeInstanceOf(Error);
	});

	it('원본 예외를 cause로 전달한다', () => {
		const cause = new Error('Unable to decode audio data');
		const error = new AudioExtractionError('DECODE', cause);

		expect(error.cause).toBe(cause);
	});

	it('message에 한글을 담지 않는다', () => {
		const messages = (['FILE_READ', 'DECODE', 'EMPTY_AUDIO', 'RESAMPLE'] as const).map(
			(failure) => new AudioExtractionError(failure).message
		);

		for (const message of messages) {
			expect(message).not.toMatch(/[가-힣]/);
		}
	});
});
