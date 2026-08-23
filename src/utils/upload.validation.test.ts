import { describe, expect, it } from 'vitest';

import type { FileToCheck } from './upload.validation';
import { checkDuration, checkSelection, UPLOAD_REJECTION_MESSAGE } from './upload.validation';

const TWO_GIGABYTES = 2_147_483_648;
const TWO_HOURS_SECONDS = 7_200;

function fileOf(name: string, size = 1_000): FileToCheck {
	return { name, size };
}

describe('checkSelection 개수', () => {
	it('한 파일이면 통과한다', () => {
		expect(checkSelection([fileOf('meeting.mp4')])).toBeNull();
	});

	it('두 파일이면 개수로 거절한다', () => {
		expect(checkSelection([fileOf('a.mp4'), fileOf('b.mp4')])).toBe('COUNT');
	});

	it('빈 목록도 개수로 거절한다', () => {
		expect(checkSelection([])).toBe('COUNT');
	});
});

describe('checkSelection 확장자', () => {
	it('mp4와 mov를 받는다', () => {
		expect(checkSelection([fileOf('meeting.mp4')])).toBeNull();
		expect(checkSelection([fileOf('meeting.mov')])).toBeNull();
	});

	it('대소문자를 가리지 않는다', () => {
		expect(checkSelection([fileOf('MEETING.MP4')])).toBeNull();
		expect(checkSelection([fileOf('Meeting.MoV')])).toBeNull();
	});

	it('그 밖의 확장자를 거절한다', () => {
		expect(checkSelection([fileOf('meeting.avi')])).toBe('EXTENSION');
		expect(checkSelection([fileOf('meeting.mkv')])).toBe('EXTENSION');
		expect(checkSelection([fileOf('meeting')])).toBe('EXTENSION');
	});

	it('이름 안에 mp4가 있어도 끝이 아니면 거절한다', () => {
		expect(checkSelection([fileOf('mp4.avi')])).toBe('EXTENSION');
	});
});

describe('checkSelection 크기', () => {
	it('2GB까지 받는다', () => {
		expect(checkSelection([fileOf('meeting.mp4', TWO_GIGABYTES)])).toBeNull();
	});

	it('2GB를 넘으면 거절한다', () => {
		expect(checkSelection([fileOf('meeting.mp4', TWO_GIGABYTES + 1)])).toBe('SIZE');
	});
});

describe('checkSelection 검사 순서', () => {
	it('개수가 확장자보다 먼저 걸린다', () => {
		expect(checkSelection([fileOf('a.avi'), fileOf('b.avi')])).toBe('COUNT');
	});

	it('확장자가 크기보다 먼저 걸린다', () => {
		expect(checkSelection([fileOf('meeting.avi', TWO_GIGABYTES + 1)])).toBe('EXTENSION');
	});
});

describe('checkDuration', () => {
	it('2시간까지 받는다', () => {
		expect(checkDuration(TWO_HOURS_SECONDS)).toBeNull();
	});

	it('2시간을 넘으면 거절한다', () => {
		expect(checkDuration(TWO_HOURS_SECONDS + 1)).toBe('DURATION');
	});

	it('읽지 못한 재생 시간은 메타데이터로 거절한다', () => {
		expect(checkDuration(Number.NaN)).toBe('METADATA');
		expect(checkDuration(Number.POSITIVE_INFINITY)).toBe('METADATA');
		expect(checkDuration(0)).toBe('METADATA');
		expect(checkDuration(-1)).toBe('METADATA');
	});
});

describe('UPLOAD_REJECTION_MESSAGE', () => {
	it('거절 이유마다 문구가 있다', () => {
		expect(UPLOAD_REJECTION_MESSAGE).toEqual({
			COUNT: '파일은 한 번에 하나만 받습니다',
			EXTENSION: 'mp4나 mov 파일만 받습니다',
			SIZE: '2GB를 넘는 파일은 받을 수 없습니다',
			DURATION: '2시간을 넘는 영상은 받을 수 없습니다',
			METADATA: '영상 정보를 읽지 못했습니다. 파일이 손상되었을 수 있습니다'
		});
	});
});
