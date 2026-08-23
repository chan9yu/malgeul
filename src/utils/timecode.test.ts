import { describe, expect, it } from 'vitest';

import { formatSrtTime, formatTimecode, formatVttTime } from './timecode';

const HALF_HOUR = 1800;
const ONE_HOUR = 3600;
const TWO_HOURS = 7200;

describe('formatTimecode', () => {
	it('영상이 1시간 미만이면 mm:ss로 적는다', () => {
		expect(formatTimecode(3, HALF_HOUR)).toBe('00:03');
		expect(formatTimecode(7, HALF_HOUR)).toBe('00:07');
		expect(formatTimecode(72, HALF_HOUR)).toBe('01:12');
		expect(formatTimecode(3599, HALF_HOUR)).toBe('59:59');
	});

	it('영상이 1시간 이상이면 h:mm:ss로 적는다', () => {
		expect(formatTimecode(ONE_HOUR, TWO_HOURS)).toBe('1:00:00');
		expect(formatTimecode(3903, TWO_HOURS)).toBe('1:05:03');
		expect(formatTimecode(TWO_HOURS, TWO_HOURS)).toBe('2:00:00');
	});

	it('표기를 고르는 기준은 구간이 아니라 영상 길이다', () => {
		expect(formatTimecode(3, TWO_HOURS)).toBe('0:00:03');
		expect(formatTimecode(72, TWO_HOURS)).toBe('0:01:12');
	});

	it('영상 길이 1시간 경계에서 표기가 갈린다', () => {
		expect(formatTimecode(3, 3599.999)).toBe('00:03');
		expect(formatTimecode(3, ONE_HOUR)).toBe('0:00:03');
	});

	it('시각 경계값', () => {
		expect(formatTimecode(0, HALF_HOUR)).toBe('00:00');
		expect(formatTimecode(59.999, HALF_HOUR)).toBe('00:59');
		expect(formatTimecode(3599.999, ONE_HOUR)).toBe('0:59:59');
		expect(formatTimecode(ONE_HOUR, ONE_HOUR)).toBe('1:00:00');
	});

	it('초는 내림으로 자른다', () => {
		expect(formatTimecode(3.9, HALF_HOUR)).toBe('00:03');
	});

	it('음수는 0으로 본다', () => {
		expect(formatTimecode(-1, HALF_HOUR)).toBe('00:00');
	});
});

describe('formatSrtTime', () => {
	it('밀리초를 쉼표로 구분한다', () => {
		expect(formatSrtTime(3.2)).toBe('00:00:03,200');
		expect(formatSrtTime(7.5)).toBe('00:00:07,500');
		expect(formatSrtTime(12)).toBe('00:00:12,000');
	});

	it('시가 두 자리로 채워진다', () => {
		expect(formatSrtTime(ONE_HOUR)).toBe('01:00:00,000');
		expect(formatSrtTime(3903.45)).toBe('01:05:03,450');
	});

	it('경계값', () => {
		expect(formatSrtTime(0)).toBe('00:00:00,000');
		expect(formatSrtTime(59.999)).toBe('00:00:59,999');
		expect(formatSrtTime(3599.999)).toBe('00:59:59,999');
		expect(formatSrtTime(ONE_HOUR)).toBe('01:00:00,000');
	});

	it('음수는 0으로 본다', () => {
		expect(formatSrtTime(-1)).toBe('00:00:00,000');
	});
});

describe('formatVttTime', () => {
	it('밀리초를 마침표로 구분한다', () => {
		expect(formatVttTime(3.2)).toBe('00:00:03.200');
		expect(formatVttTime(7.5)).toBe('00:00:07.500');
		expect(formatVttTime(12)).toBe('00:00:12.000');
	});

	it('경계값', () => {
		expect(formatVttTime(0)).toBe('00:00:00.000');
		expect(formatVttTime(59.999)).toBe('00:00:59.999');
		expect(formatVttTime(3599.999)).toBe('00:59:59.999');
		expect(formatVttTime(ONE_HOUR)).toBe('01:00:00.000');
	});

	it('음수는 0으로 본다', () => {
		expect(formatVttTime(-1)).toBe('00:00:00.000');
	});
});

describe('세 표기의 산술', () => {
	it('같은 초를 같은 시각으로 읽는다', () => {
		const samples = [0, 3.2, 7.5, 59.999, 61.004, 3599.999, ONE_HOUR, 3903.45];

		for (const seconds of samples) {
			const srt = formatSrtTime(seconds);
			const vtt = formatVttTime(seconds);

			expect(vtt).toBe(srt.replace(',', '.'));
			expect(formatTimecode(seconds, TWO_HOURS)).toBe(
				`${Number(srt.slice(0, 2))}:${srt.slice(3, 5)}:${srt.slice(6, 8)}`
			);
		}
	});
});
