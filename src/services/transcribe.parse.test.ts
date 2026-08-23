import { describe, expect, it } from 'vitest';

import { toSegments } from './transcribe.parse';

const FALLBACK_END = 130;

describe('toSegments', () => {
	it('시작과 끝 시각이 붙은 구간을 읽는다', () => {
		const chunks = [
			{ timestamp: [3.2, 7.5], text: ' 안녕하세요, 오늘 회의를 시작하겠습니다.' },
			{ timestamp: [7.5, 12], text: ' 지난주에 이야기한 일정부터 확인하겠습니다.' }
		];

		expect(toSegments(chunks, FALLBACK_END)).toEqual([
			{ startSeconds: 3.2, endSeconds: 7.5, text: '안녕하세요, 오늘 회의를 시작하겠습니다.' },
			{ startSeconds: 7.5, endSeconds: 12, text: '지난주에 이야기한 일정부터 확인하겠습니다.' }
		]);
	});

	it('닫는 타임스탬프가 없는 마지막 구간은 조각의 끝으로 메운다', () => {
		const chunks = [{ timestamp: [120, null], text: '마지막 문장입니다.' }];

		expect(toSegments(chunks, FALLBACK_END)).toEqual([
			{ startSeconds: 120, endSeconds: FALLBACK_END, text: '마지막 문장입니다.' }
		]);
	});

	it('시작 시각이 없으면 구간을 버린다', () => {
		const chunks = [{ timestamp: [null, null], text: '시각을 모르는 문장' }];

		expect(toSegments(chunks, FALLBACK_END)).toEqual([]);
	});

	it('빈 문장과 공백만 있는 문장을 버린다', () => {
		const chunks = [
			{ timestamp: [0, 1], text: '   ' },
			{ timestamp: [1, 2], text: '' },
			{ timestamp: [2, 3], text: '남는 문장' }
		];

		expect(toSegments(chunks, FALLBACK_END)).toEqual([{ startSeconds: 2, endSeconds: 3, text: '남는 문장' }]);
	});

	it('끝이 시작보다 앞서면 시작으로 맞춘다', () => {
		const chunks = [{ timestamp: [10, 4], text: '거꾸로 온 구간' }];

		expect(toSegments(chunks, FALLBACK_END)).toEqual([{ startSeconds: 10, endSeconds: 10, text: '거꾸로 온 구간' }]);
	});

	it('구간 목록이 없으면 빈 배열을 돌려준다', () => {
		expect(toSegments(undefined, FALLBACK_END)).toEqual([]);
		expect(toSegments(null, FALLBACK_END)).toEqual([]);
		expect(toSegments('chunks', FALLBACK_END)).toEqual([]);
	});
});
