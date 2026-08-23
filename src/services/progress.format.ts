import type { BytesProgress } from './types';

const BYTES_PER_MEGABYTE = 1_000_000;
const PERCENT_MAX = 100;

export function formatBytesProgress(progress: BytesProgress) {
	return `${toDisplayMegabytes(progress.loadedBytes)}MB / ${toDisplayMegabytes(progress.totalBytes)}MB`;
}

/** 화면에 적히는 눈금이다. 이 값이 그대로일 때 진행 이벤트를 다시 보내면 같은 문구만 되풀이된다 */
export function toDisplayMegabytes(bytes: number) {
	return Math.max(0, Math.round(bytes / BYTES_PER_MEGABYTE));
}

export function toPercent(doneUnits: number, totalUnits: number) {
	if (totalUnits <= 0) {
		return PERCENT_MAX;
	}

	const ratio = (doneUnits / totalUnits) * PERCENT_MAX;

	return Math.min(PERCENT_MAX, Math.max(0, Math.round(ratio)));
}
