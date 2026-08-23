import { describe, expect, it } from 'vitest';

import {
	mergeWindows,
	planWindows,
	type TranscriptionWindow,
	WINDOW_OVERLAP_SECONDS,
	WINDOW_SECONDS,
	type WindowResult
} from './transcribe.window';

describe('planWindows', () => {
	it('음성이 없으면 창을 만들지 않는다', () => {
		expect(planWindows(0)).toEqual([]);
		expect(planWindows(-1)).toEqual([]);
	});

	it('창 하나보다 짧으면 겹침 없이 한 창이다', () => {
		expect(planWindows(60)).toEqual([
			{ coreStartSeconds: 0, coreEndSeconds: 60, sliceStartSeconds: 0, sliceEndSeconds: 60 }
		]);
	});

	it('창 앞뒤로 겹침을 붙이되 음성 밖으로 나가지 않는다', () => {
		const windows = planWindows(WINDOW_SECONDS * 2);

		expect(windows).toEqual([
			{
				coreStartSeconds: 0,
				coreEndSeconds: WINDOW_SECONDS,
				sliceStartSeconds: 0,
				sliceEndSeconds: WINDOW_SECONDS + WINDOW_OVERLAP_SECONDS
			},
			{
				coreStartSeconds: WINDOW_SECONDS,
				coreEndSeconds: WINDOW_SECONDS * 2,
				sliceStartSeconds: WINDOW_SECONDS - WINDOW_OVERLAP_SECONDS,
				sliceEndSeconds: WINDOW_SECONDS * 2
			}
		]);
	});

	it('창의 core가 빈틈없이 이어져 전체를 덮는다', () => {
		const totalSeconds = 30 * 60;
		const windows = planWindows(totalSeconds);

		expect(windows[0]?.coreStartSeconds).toBe(0);
		expect(windows.at(-1)?.coreEndSeconds).toBe(totalSeconds);

		for (const [index, window] of windows.entries()) {
			if (index === 0) {
				continue;
			}

			expect(window.coreStartSeconds).toBe(windows[index - 1]?.coreEndSeconds);
		}
	});
});

function windowAt(coreStartSeconds: number, coreEndSeconds: number): TranscriptionWindow {
	return {
		coreStartSeconds,
		coreEndSeconds,
		sliceStartSeconds: Math.max(0, coreStartSeconds - WINDOW_OVERLAP_SECONDS),
		sliceEndSeconds: coreEndSeconds + WINDOW_OVERLAP_SECONDS
	};
}

describe('mergeWindows', () => {
	it('조각 기준 시각을 전체 기준으로 옮긴다', () => {
		const results: WindowResult[] = [
			{ window: windowAt(120, 240), segments: [{ startSeconds: 10, endSeconds: 14, text: '두 번째 창의 문장' }] }
		];

		expect(mergeWindows(results)).toEqual([{ startSeconds: 125, endSeconds: 129, text: '두 번째 창의 문장' }]);
	});

	it('겹침에서 두 창이 같은 문장을 내놓아도 한 번만 남는다', () => {
		const results: WindowResult[] = [
			{
				window: windowAt(0, 120),
				segments: [
					{ startSeconds: 100, endSeconds: 104, text: '앞 창의 문장' },
					{ startSeconds: 118, endSeconds: 122, text: '겹침에 걸친 문장' }
				]
			},
			{
				window: windowAt(120, 240),
				segments: [
					{ startSeconds: 3, endSeconds: 7, text: '겹침에 걸친 문장' },
					{ startSeconds: 20, endSeconds: 24, text: '뒤 창의 문장' }
				]
			}
		];

		expect(mergeWindows(results).map((segment) => segment.text)).toEqual([
			'앞 창의 문장',
			'겹침에 걸친 문장',
			'뒤 창의 문장'
		]);
	});

	it('겹침에 걸친 문장은 중간 시각이 속한 창이 가져간다', () => {
		const results: WindowResult[] = [
			{ window: windowAt(0, 120), segments: [{ startSeconds: 118, endSeconds: 122, text: '경계 문장' }] },
			{ window: windowAt(120, 240), segments: [{ startSeconds: 3, endSeconds: 7, text: '경계 문장' }] }
		];

		expect(mergeWindows(results)).toEqual([{ startSeconds: 118, endSeconds: 122, text: '경계 문장' }]);
	});

	it('마지막 창은 core 끝을 넘긴 문장도 버리지 않는다', () => {
		const results: WindowResult[] = [
			{ window: windowAt(0, 120), segments: [{ startSeconds: 119, endSeconds: 125, text: '끝에 걸친 문장' }] }
		];

		expect(mergeWindows(results)).toEqual([{ startSeconds: 119, endSeconds: 125, text: '끝에 걸친 문장' }]);
	});

	it('창이 없으면 빈 배열이다', () => {
		expect(mergeWindows([])).toEqual([]);
	});
});
