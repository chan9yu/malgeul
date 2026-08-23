import { describe, expect, it } from 'vitest';

import { formatTimecode } from './timecode';

describe('formatTimecode', () => {
	it('1시간 미만은 mm:ss로 적는다', () => {
		expect(formatTimecode(3)).toBe('00:03');
		expect(formatTimecode(7)).toBe('00:07');
		expect(formatTimecode(72)).toBe('01:12');
		expect(formatTimecode(3599)).toBe('59:59');
	});

	it('1시간부터는 h:mm:ss로 적는다', () => {
		expect(formatTimecode(3600)).toBe('1:00:00');
		expect(formatTimecode(3903)).toBe('1:05:03');
		expect(formatTimecode(7200)).toBe('2:00:00');
	});

	it('초는 내림으로 자른다', () => {
		expect(formatTimecode(3.9)).toBe('00:03');
	});

	it('음수는 0으로 본다', () => {
		expect(formatTimecode(-1)).toBe('00:00');
	});
});
