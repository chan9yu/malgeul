import { describe, expect, it } from 'vitest';

import { formatBytesProgress, toPercent } from './progress.format';
import type { BytesProgress } from './types';

function bytesProgress(loadedBytes: number, totalBytes: number): BytesProgress {
	return {
		kind: 'bytes',
		stage: 'model',
		loadedBytes,
		totalBytes
	};
}

describe('formatBytesProgress', () => {
	it('SPEC의 표기를 그대로 만든다', () => {
		expect(formatBytesProgress(bytesProgress(312_000_000, 600_000_000))).toBe('312MB / 600MB');
	});

	it('MB는 1000의 제곱으로 환산하고 반올림한다', () => {
		expect(formatBytesProgress(bytesProgress(1_500_000, 563_400_000))).toBe('2MB / 563MB');
	});

	it('시작과 끝을 표기한다', () => {
		expect(formatBytesProgress(bytesProgress(0, 600_000_000))).toBe('0MB / 600MB');
		expect(formatBytesProgress(bytesProgress(600_000_000, 600_000_000))).toBe('600MB / 600MB');
	});
});

describe('toPercent', () => {
	it('처리를 마친 몫을 백분율로 바꾼다', () => {
		expect(toPercent(0, 200)).toBe(0);
		expect(toPercent(50, 200)).toBe(25);
		expect(toPercent(200, 200)).toBe(100);
	});

	it('0과 100 밖으로 나가지 않는다', () => {
		expect(toPercent(-10, 200)).toBe(0);
		expect(toPercent(300, 200)).toBe(100);
	});

	it('전체가 0이면 끝난 것으로 본다', () => {
		expect(toPercent(0, 0)).toBe(100);
	});
});
