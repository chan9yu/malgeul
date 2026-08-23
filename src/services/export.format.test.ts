import { describe, expect, it } from 'vitest';

import { buildExportText, buildSrt, buildTxt, buildVtt, toExportFileName } from './export.format';
import type { Transcript } from './types';

const SPEC_TRANSCRIPT: Transcript = {
	segments: [
		{ startSeconds: 3.2, endSeconds: 7.5, text: '안녕하세요, 오늘 회의를 시작하겠습니다.' },
		{ startSeconds: 7.5, endSeconds: 12, text: '지난주에 이야기한 일정부터 확인하겠습니다.' }
	],
	durationSeconds: 12
};

const SPEC_TXT = [
	'[00:03] 안녕하세요, 오늘 회의를 시작하겠습니다.',
	'[00:07] 지난주에 이야기한 일정부터 확인하겠습니다.',
	''
].join('\n');

const SPEC_SRT = [
	'1',
	'00:00:03,200 --> 00:00:07,500',
	'안녕하세요, 오늘 회의를 시작하겠습니다.',
	'',
	'2',
	'00:00:07,500 --> 00:00:12,000',
	'지난주에 이야기한 일정부터 확인하겠습니다.',
	''
].join('\n');

const SPEC_VTT = [
	'WEBVTT',
	'',
	'00:00:03.200 --> 00:00:07.500',
	'안녕하세요, 오늘 회의를 시작하겠습니다.',
	'',
	'00:00:07.500 --> 00:00:12.000',
	'지난주에 이야기한 일정부터 확인하겠습니다.',
	''
].join('\n');

function transcriptOf(segments: Transcript['segments'], durationSeconds: number): Transcript {
	return {
		segments,
		durationSeconds
	};
}

describe('SPEC 출력 예시', () => {
	it('txt가 예시와 문자 단위로 같다', () => {
		expect(buildTxt(SPEC_TRANSCRIPT)).toBe(SPEC_TXT);
	});

	it('srt가 예시와 문자 단위로 같다', () => {
		expect(buildSrt(SPEC_TRANSCRIPT)).toBe(SPEC_SRT);
	});

	it('vtt가 예시와 문자 단위로 같다', () => {
		expect(buildVtt(SPEC_TRANSCRIPT)).toBe(SPEC_VTT);
	});
});

describe('구간이 없거나 하나일 때', () => {
	const empty = transcriptOf([], 12);
	const single = transcriptOf([{ startSeconds: 3.2, endSeconds: 7.5, text: '한 문장뿐입니다.' }], 12);

	it('구간이 없으면 txt와 srt는 빈 문자열이다', () => {
		expect(buildTxt(empty)).toBe('');
		expect(buildSrt(empty)).toBe('');
	});

	it('구간이 없어도 vtt는 머리글을 남긴다', () => {
		expect(buildVtt(empty)).toBe('WEBVTT\n');
	});

	it('구간이 하나면 끝에 빈 줄을 더 붙이지 않는다', () => {
		expect(buildTxt(single)).toBe('[00:03] 한 문장뿐입니다.\n');
		expect(buildSrt(single)).toBe('1\n00:00:03,200 --> 00:00:07,500\n한 문장뿐입니다.\n');
		expect(buildVtt(single)).toBe('WEBVTT\n\n00:00:03.200 --> 00:00:07.500\n한 문장뿐입니다.\n');
	});
});

describe('1시간 이상인 영상', () => {
	const longVideo = transcriptOf([{ startSeconds: 3661.5, endSeconds: 3665, text: '한 시간을 넘겼습니다.' }], 3700);

	it('txt만 h:mm:ss로 바뀐다', () => {
		expect(buildTxt(longVideo)).toBe('[1:01:01] 한 시간을 넘겼습니다.\n');
	});

	it('srt와 vtt는 늘 HH:MM:SS다', () => {
		expect(buildSrt(longVideo)).toBe('1\n01:01:01,500 --> 01:01:05,000\n한 시간을 넘겼습니다.\n');
		expect(buildVtt(longVideo)).toBe('WEBVTT\n\n01:01:01.500 --> 01:01:05.000\n한 시간을 넘겼습니다.\n');
	});

	it('구간이 1시간 미만이어도 영상이 1시간 이상이면 h:mm:ss다', () => {
		const early = transcriptOf([{ startSeconds: 3.2, endSeconds: 7.5, text: '첫 문장입니다.' }], 3700);

		expect(buildTxt(early)).toBe('[0:00:03] 첫 문장입니다.\n');
	});
});

describe('문장 안의 줄바꿈', () => {
	it('세 형식 모두 공백 하나로 편다', () => {
		const wrapped = transcriptOf([{ startSeconds: 3.2, endSeconds: 7.5, text: '첫 줄\n둘째 줄' }], 12);

		expect(buildTxt(wrapped)).toBe('[00:03] 첫 줄 둘째 줄\n');
		expect(buildSrt(wrapped)).toBe('1\n00:00:03,200 --> 00:00:07,500\n첫 줄 둘째 줄\n');
		expect(buildVtt(wrapped)).toBe('WEBVTT\n\n00:00:03.200 --> 00:00:07.500\n첫 줄 둘째 줄\n');
	});

	it('빈 줄과 캐리지 리턴, 앞뒤 공백도 함께 걷는다', () => {
		const messy = transcriptOf([{ startSeconds: 0, endSeconds: 1, text: '  앞\r\n\r\n  뒤  ' }], 12);

		expect(buildSrt(messy)).toBe('1\n00:00:00,000 --> 00:00:01,000\n앞 뒤\n');
	});
});

describe('밀리초 반올림', () => {
	it('목록과 srt가 같은 값에서 갈라진다', () => {
		const rounded = transcriptOf([{ startSeconds: 3.9996, endSeconds: 4.9996, text: '반올림 경계입니다.' }], 12);

		expect(buildTxt(rounded)).toBe('[00:04] 반올림 경계입니다.\n');
		expect(buildSrt(rounded)).toBe('1\n00:00:04,000 --> 00:00:05,000\n반올림 경계입니다.\n');
	});
});

describe('buildExportText', () => {
	it('형식마다 같은 이름의 생성기를 부른다', () => {
		expect(buildExportText(SPEC_TRANSCRIPT, 'txt')).toBe(SPEC_TXT);
		expect(buildExportText(SPEC_TRANSCRIPT, 'srt')).toBe(SPEC_SRT);
		expect(buildExportText(SPEC_TRANSCRIPT, 'vtt')).toBe(SPEC_VTT);
	});
});

describe('toExportFileName', () => {
	it('원본 이름에서 확장자만 바꾼다', () => {
		expect(toExportFileName('meeting.mp4', 'txt')).toBe('meeting.txt');
		expect(toExportFileName('meeting.mp4', 'srt')).toBe('meeting.srt');
		expect(toExportFileName('meeting.mp4', 'vtt')).toBe('meeting.vtt');
	});

	it('마지막 점만 확장자로 본다', () => {
		expect(toExportFileName('2026.08.23 회의.mov', 'srt')).toBe('2026.08.23 회의.srt');
	});

	it('확장자가 없으면 뒤에 붙인다', () => {
		expect(toExportFileName('meeting', 'txt')).toBe('meeting.txt');
	});
});
