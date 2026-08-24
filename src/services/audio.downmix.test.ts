import { describe, expect, it } from 'vitest';

import { mixChannelsToMono } from './audio.downmix';

function channel(...values: number[]) {
	return Float32Array.from(values);
}

describe('mixChannelsToMono', () => {
	it('모노는 값을 유지하되 새 배열에 담는다', () => {
		const only = channel(0.1, -0.2, 0.3);
		const mixed = mixChannelsToMono([only]);

		expect(Array.from(mixed, (sample) => Number(sample.toFixed(4)))).toEqual([0.1, -0.2, 0.3]);
		expect(mixed.buffer).not.toBe(only.buffer);
	});

	it('스테레오를 평균 낸다. Web Audio 의 2채널 다운믹스와 같은 값이다', () => {
		const mixed = mixChannelsToMono([channel(1, 0, -1), channel(0, 1, 1)]);

		expect(Array.from(mixed)).toEqual([0.5, 0.5, 0]);
	});

	it('첫 채널이 무음이어도 다른 채널의 소리가 남는다', () => {
		const silent = channel(0, 0, 0, 0);
		const voice = channel(0.8, -0.8, 0.4, -0.4);
		const eight = [silent, voice, silent, silent, silent, silent, silent, silent];

		const mixed = mixChannelsToMono(eight);

		expect(mixed.some((sample) => sample !== 0)).toBe(true);
		expect(Array.from(mixed, (sample) => Number(sample.toFixed(4)))).toEqual([0.1, -0.1, 0.05, -0.05]);
	});

	it('채널이 없으면 빈 결과를 돌려준다', () => {
		expect(mixChannelsToMono([]).length).toBe(0);
	});
});
