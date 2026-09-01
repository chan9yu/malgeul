import { describe, expect, it } from 'vitest';

import { findSilenceGaps } from './audio.silence';

const SAMPLE_RATE = 16000;

/** 씨를 고정한다. Math.random 으로 잡음을 만들면 검사가 가끔 실패한다 */
function makeNoise(seed: number) {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;

		return (state / 4294967296) * 2 - 1;
	};
}

interface Part {
	seconds: number;
	amp: number;
	noise?: number;
}

function build(parts: Part[]) {
	const noise = makeNoise(12345);
	const total = parts.reduce((count, part) => count + Math.round(part.seconds * SAMPLE_RATE), 0);
	const pcm = new Float32Array(total);
	let at = 0;

	for (const part of parts) {
		const length = Math.round(part.seconds * SAMPLE_RATE);
		for (let i = 0; i < length; i += 1) {
			const tone = part.amp === 0 ? 0 : part.amp * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
			pcm[at + i] = tone + (part.noise ?? 0) * noise();
		}
		at += length;
	}

	return pcm;
}

const spans = (parts: Part[]) =>
	findSilenceGaps(build(parts), SAMPLE_RATE).map(
		(gap) => `${gap.startSeconds.toFixed(1)}-${gap.endSeconds.toFixed(1)}`
	);

describe('findSilenceGaps', () => {
	it('내내 말이면 건너뛸 무음이 없다', () => {
		expect(spans([{ seconds: 30, amp: 0.3 }])).toEqual([]);
	});

	it('말 사이의 긴 무음을 찾고 앞뒤로 여유를 남긴다', () => {
		expect(
			spans([
				{ seconds: 10, amp: 0.3 },
				{ seconds: 10, amp: 0 },
				{ seconds: 10, amp: 0.3 }
			])
		).toEqual(['10.5-19.5']);
	});

	it('짧은 쉼은 건너뛸 무음으로 보지 않는다', () => {
		expect(
			spans([
				{ seconds: 10, amp: 0.3 },
				{ seconds: 2, amp: 0 },
				{ seconds: 10, amp: 0.3 }
			])
		).toEqual([]);
	});

	it('녹화 앞뒤의 빈 소리는 바깥쪽 여유 없이 끝까지 잡는다', () => {
		expect(
			spans([
				{ seconds: 12, amp: 0 },
				{ seconds: 10, amp: 0.3 },
				{ seconds: 12, amp: 0 }
			])
		).toEqual(['0.0-11.5', '22.5-34.0']);
	});

	it('통째로 무음이면 전체가 한 구간이다', () => {
		expect(spans([{ seconds: 30, amp: 0 }])).toEqual(['0.0-30.0']);
	});

	it('방 잡음 위의 조용한 말을 무음으로 지우지 않는다', () => {
		expect(
			spans([
				{ seconds: 10, amp: 0.02, noise: 0.004 },
				{ seconds: 10, amp: 0, noise: 0.004 },
				{ seconds: 10, amp: 0.02, noise: 0.004 }
			])
		).toEqual(['10.5-19.5']);
	});

	it('말과 잡음 바닥이 안 갈리면 아무것도 건너뛰지 않는다', () => {
		expect(
			spans([
				{ seconds: 10, amp: 0.03, noise: 0.02 },
				{ seconds: 10, amp: 0, noise: 0.02 }
			])
		).toEqual([]);
	});
});
