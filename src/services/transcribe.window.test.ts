import { describe, expect, it } from 'vitest';

import { WHISPER_CHUNK_SECONDS, WHISPER_STRIDE_SECONDS } from './model.config';
import {
	alignedWindowSeconds,
	countChunks,
	countChunksPerWindow,
	mergeWindows,
	planWindows,
	planWindowsWithPlan,
	type TranscriptionWindow,
	WINDOW_OVERLAP_SECONDS,
	type WindowResult
} from './transcribe.window';

const JUMP = WHISPER_CHUNK_SECONDS - 2 * WHISPER_STRIDE_SECONDS;
/** transcribe.window.ts 의 MIN_WINDOW_STEPS 와 같은 값. 아래끝을 stride 에서 다시 뽑는다 */
const MIN_WINDOW_STEPS = 3;
const MAX_WINDOW_STEPS = 9;
const LENGTHS = [90, 300, 1800, 3540, 7200];

describe('alignedWindowSeconds', () => {
	/**
	 * 이 검사가 창 값을 지킨다. 창에 겹침을 더한 길이가 `30 + k*전진폭` 이 아니면 조각이 하나씩
	 * 더 생겨 이득이 사라진다. 창을 손으로 다른 값으로 바꾸면 여기서 걸린다.
	 */
	it('창에 겹침을 더한 길이가 조각 전진폭에 맞아떨어진다', () => {
		for (const totalSeconds of LENGTHS) {
			const windowSeconds = alignedWindowSeconds(totalSeconds);

			expect((windowSeconds + 2 * WINDOW_OVERLAP_SECONDS - WHISPER_CHUNK_SECONDS) % JUMP).toBe(0);
		}
	});

	it('창을 너무 잘게 잡지 않는다', () => {
		// 창이 작아지면 겹침이 차지하는 몫이 커져 90초 영상에서 오히려 느려졌다.
		// 아래끝은 stride 에 딸려 움직이므로 값을 박지 않고 같은 식으로 뽑는다
		const floor = WHISPER_CHUNK_SECONDS + MIN_WINDOW_STEPS * JUMP - 2 * WINDOW_OVERLAP_SECONDS;

		for (const totalSeconds of LENGTHS) {
			expect(alignedWindowSeconds(totalSeconds)).toBeGreaterThanOrEqual(floor);
		}
	});

	it('긴 영상일수록 창이 커지되 상한이 있다', () => {
		const ceiling = WHISPER_CHUNK_SECONDS + MAX_WINDOW_STEPS * JUMP - 2 * WINDOW_OVERLAP_SECONDS;

		expect(alignedWindowSeconds(300)).toBeLessThan(alignedWindowSeconds(7200));
		expect(alignedWindowSeconds(7200)).toBeLessThanOrEqual(ceiling);
	});
});

describe('planWindows', () => {
	it('음성이 없으면 창을 만들지 않는다', () => {
		expect(planWindows(0)).toEqual([]);
		expect(planWindows(-1)).toEqual([]);
	});

	it('창의 core 가 빈틈없이 이어져 전체를 덮는다', () => {
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

	it('조각이 오디오 밖으로 나가지 않는다', () => {
		const totalSeconds = 600;

		for (const window of planWindows(totalSeconds)) {
			expect(window.sliceStartSeconds).toBeGreaterThanOrEqual(0);
			expect(window.sliceEndSeconds).toBeLessThanOrEqual(totalSeconds);
		}
	});

	it('건너뛴 무음 안에는 창을 만들지 않는다', () => {
		const gaps = [{ startSeconds: 100, endSeconds: 200 }];
		const inside = planWindows(600, gaps).some(
			(window) => window.coreStartSeconds >= 100 && window.coreEndSeconds <= 200
		);

		expect(inside).toBe(false);
	});

	/**
	 * 짧은 무음을 건너뛰면 말 구간마다 겹침이 새로 붙어 오히려 조각이 는다. 문턱값을 하나로
	 * 고정하면 내용에 따라 느려지는데, 후보를 견주어 고르면 그 일이 생기지 않는다.
	 */
	it('어떤 말과 무음 배치에서도 안 건너뛴 계획보다 조각이 늘지 않는다', () => {
		const patterns = [
			[30, 5, 40],
			[30, 8, 40],
			[45, 3, 40],
			[60, 10, 25],
			[120, 30, 12],
			[240, 60, 8],
			[20, 6, 60]
		];

		for (const [speech, silence, repeat] of patterns) {
			const totalSeconds = (speech + silence) * repeat;
			const gaps = Array.from({ length: repeat }, (_, index) => ({
				startSeconds: index * (speech + silence) + speech + 0.5,
				endSeconds: index * (speech + silence) + speech + silence - 0.5
			})).filter((gap) => gap.endSeconds - gap.startSeconds >= 2);

			const skipped = countChunks(planWindows(totalSeconds, gaps));
			const plain = countChunks(planWindows(totalSeconds, []));

			expect(skipped).toBeLessThanOrEqual(plain);
		}
	});

	/**
	 * 계측을 읽는 쪽이 "무음이 없었다"와 "계측이 안 붙었다"를 갈라야 한다. 찾은 구간 수를 따로
	 * 실어야 건너뛴 양이 0인 것만 보고 측정이 성립한 줄 오해하지 않는다.
	 */
	it('건너뛸 만한 무음이 없어도 찾은 구간 수는 남긴다', () => {
		const plan = planWindowsWithPlan(600, [{ startSeconds: 100, endSeconds: 103 }]);

		expect(plan.silenceGapCount).toBe(1);
		expect(plan.skippedSilenceSeconds).toBe(0);
		expect(plan.minSilenceSeconds).toBe(Infinity);
	});

	it('창별 조각 수가 창마다 하나씩 있고 합이 총합과 같다', () => {
		const plan = planWindowsWithPlan(3600);

		expect(countChunksPerWindow(plan.windows)).toEqual(plan.chunkCounts);

		expect(plan.chunkCounts).toHaveLength(plan.windows.length);
		expect(plan.chunkCounts.reduce((total, count) => total + count, 0)).toBe(plan.chunkCount);
	});

	it('무음을 하나도 못 찾으면 구간 수가 0이다', () => {
		expect(planWindowsWithPlan(600, []).silenceGapCount).toBe(0);
	});

	it('긴 무음은 건너뛰고 계획에 그 길이를 적어 둔다', () => {
		const plan = planWindowsWithPlan(1200, [{ startSeconds: 300, endSeconds: 420 }]);

		expect(plan.silenceGapCount).toBe(1);
		expect(plan.skippedSilenceSeconds).toBeCloseTo(120);
		expect(plan.chunkCount).toBeLessThan(countChunks(planWindows(1200, [])));
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

	it('마지막 창은 core 끝을 넘긴 문장도 버리지 않는다', () => {
		const results: WindowResult[] = [
			{ window: windowAt(0, 120), segments: [{ startSeconds: 119, endSeconds: 125, text: '끝에 걸친 문장' }] }
		];

		expect(mergeWindows(results)).toEqual([{ startSeconds: 119, endSeconds: 125, text: '끝에 걸친 문장' }]);
	});

	/**
	 * 무음을 건너뛰면 창이 떨어져 놓인다. 말 구간의 마지막 창에서 core 를 넘긴 문장을 안 살리면
	 * 다음 창의 core 가 멀리 있어 어느 쪽에도 안 들어가고 조용히 사라진다.
	 */
	it('건너뛴 무음 앞에서 core 를 넘긴 문장이 사라지지 않는다', () => {
		const results: WindowResult[] = [
			{
				window: { coreStartSeconds: 0, coreEndSeconds: 100, sliceStartSeconds: 0, sliceEndSeconds: 100 },
				segments: [{ startSeconds: 98, endSeconds: 104, text: '구간 끝에 걸친 문장' }]
			},
			{
				window: { coreStartSeconds: 160, coreEndSeconds: 260, sliceStartSeconds: 160, sliceEndSeconds: 260 },
				segments: [{ startSeconds: 5, endSeconds: 11, text: '뒤 구간 문장' }]
			}
		];

		expect(mergeWindows(results).map((segment) => segment.text)).toEqual(['구간 끝에 걸친 문장', '뒤 구간 문장']);
	});

	it('창이 없으면 빈 배열이다', () => {
		expect(mergeWindows([])).toEqual([]);
	});
});
