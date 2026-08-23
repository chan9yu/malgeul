import { describe, expect, it } from 'vitest';

import { findPlayingSegmentIndex, NO_PLAYING_SEGMENT } from './playing-segment';

const segments = [{ startSeconds: 3.2 }, { startSeconds: 7.5 }, { startSeconds: 12 }];

describe('findPlayingSegmentIndex', () => {
	it('시작 시각 이상이고 다음 문장의 시작 시각 미만인 문장을 고른다', () => {
		expect(findPlayingSegmentIndex(segments, 3.2)).toBe(0);
		expect(findPlayingSegmentIndex(segments, 5)).toBe(0);
		expect(findPlayingSegmentIndex(segments, 7.4)).toBe(0);
	});

	it('다음 문장의 시작 시각에 닿으면 그 문장으로 넘어간다', () => {
		expect(findPlayingSegmentIndex(segments, 7.5)).toBe(1);
		expect(findPlayingSegmentIndex(segments, 11.99)).toBe(1);
		expect(findPlayingSegmentIndex(segments, 12)).toBe(2);
	});

	it('첫 문장이 시작하기 전에는 재생 중인 문장이 없다', () => {
		expect(findPlayingSegmentIndex(segments, 0)).toBe(NO_PLAYING_SEGMENT);
		expect(findPlayingSegmentIndex(segments, 3.19)).toBe(NO_PLAYING_SEGMENT);
	});

	it('마지막 문장은 다음이 없어 영상 끝까지 이어진다', () => {
		expect(findPlayingSegmentIndex(segments, 12)).toBe(2);
		expect(findPlayingSegmentIndex(segments, 600)).toBe(2);
	});

	it('문장이 없으면 재생 중인 문장도 없다', () => {
		expect(findPlayingSegmentIndex([], 0)).toBe(NO_PLAYING_SEGMENT);
		expect(findPlayingSegmentIndex([], 10)).toBe(NO_PLAYING_SEGMENT);
	});

	it('시작 시각 바로 앞에 선 자리도 그 문장으로 본다', () => {
		expect(findPlayingSegmentIndex(segments, 7.5 - 0.000001)).toBe(1);
		expect(findPlayingSegmentIndex(segments, 12 - 0.0009)).toBe(2);
	});

	it('밀리초를 넘는 차이는 앞 문장으로 남는다', () => {
		expect(findPlayingSegmentIndex(segments, 7.5 - 0.002)).toBe(0);
		expect(findPlayingSegmentIndex(segments, 12 - 0.5)).toBe(1);
	});

	it('문장 사이가 비어 있어도 앞 문장을 그대로 둔다', () => {
		const withGap = [{ startSeconds: 0 }, { startSeconds: 100 }];

		expect(findPlayingSegmentIndex(withGap, 50)).toBe(0);
	});
});
