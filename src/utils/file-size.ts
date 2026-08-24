const BYTES_PER_MEBIBYTE = 1024 * 1024;
const BYTES_PER_GIBIBYTE = 1024 * BYTES_PER_MEBIBYTE;

/** 크기 제한 1.9GB가 1,992,294,400바이트라서 표시도 이진 단위로 맞춘다 */
export function formatFileSize(bytes: number) {
	if (bytes >= BYTES_PER_GIBIBYTE) {
		return `${(bytes / BYTES_PER_GIBIBYTE).toFixed(1)}GB`;
	}

	return `${Math.round(bytes / BYTES_PER_MEBIBYTE)}MB`;
}
