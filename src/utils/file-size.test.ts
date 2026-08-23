import { describe, expect, it } from 'vitest';

import { formatFileSize } from './file-size';

describe('formatFileSize', () => {
	it('1GB 미만은 MB로 적는다', () => {
		expect(formatFileSize(0)).toBe('0MB');
		expect(formatFileSize(340 * 1024 * 1024)).toBe('340MB');
		expect(formatFileSize(1023 * 1024 * 1024)).toBe('1023MB');
	});

	it('1GB부터는 GB로 소수 한 자리까지 적는다', () => {
		expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0GB');
		expect(formatFileSize(1.4 * 1024 * 1024 * 1024)).toBe('1.4GB');
	});

	it('크기 제한 2GB를 2.0GB로 적는다', () => {
		expect(formatFileSize(2_147_483_648)).toBe('2.0GB');
	});
});
