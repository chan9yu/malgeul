import type { TranscriptSegment } from './types';

/** 한 창이 진행률 한 칸이다. 짧게 잡으면 진행률이 촘촘해지는 대신 겹침 몫의 연산이 늘어난다 */
export const WINDOW_SECONDS = 120;
/** 창 경계에서 말이 잘리지 않도록 앞뒤로 덧붙여 모델에 넘기는 길이 */
export const WINDOW_OVERLAP_SECONDS = 5;

export interface TranscriptionWindow {
	/** 이 창이 결과를 책임지는 범위. 창끼리 겹치지 않고 전체를 덮는다 */
	coreStartSeconds: number;
	coreEndSeconds: number;
	/** 모델에 실제로 넘기는 조각. core 앞뒤에 겹침을 더한 범위다 */
	sliceStartSeconds: number;
	sliceEndSeconds: number;
}

export interface WindowResult {
	window: TranscriptionWindow;
	/** 조각의 시작을 0으로 보는 상대 시각 */
	segments: TranscriptSegment[];
}

export function planWindows(totalSeconds: number): TranscriptionWindow[] {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
		return [];
	}

	const windows: TranscriptionWindow[] = [];

	for (let coreStart = 0; coreStart < totalSeconds; coreStart += WINDOW_SECONDS) {
		const coreEnd = Math.min(coreStart + WINDOW_SECONDS, totalSeconds);
		windows.push({
			coreStartSeconds: coreStart,
			coreEndSeconds: coreEnd,
			sliceStartSeconds: Math.max(0, coreStart - WINDOW_OVERLAP_SECONDS),
			sliceEndSeconds: Math.min(totalSeconds, coreEnd + WINDOW_OVERLAP_SECONDS)
		});
	}

	return windows;
}

export function mergeWindows(results: WindowResult[]): TranscriptSegment[] {
	const lastIndex = results.length - 1;

	return results.flatMap((result, index) => keepCoreSegments(result, index === lastIndex));
}

function keepCoreSegments(result: WindowResult, isLast: boolean) {
	const shifted = result.segments.map((segment) => shiftSegment(segment, result.window.sliceStartSeconds));

	return shifted.filter((segment) => isInCore(segment, result.window, isLast));
}

function shiftSegment(segment: TranscriptSegment, offsetSeconds: number): TranscriptSegment {
	return {
		startSeconds: segment.startSeconds + offsetSeconds,
		endSeconds: segment.endSeconds + offsetSeconds,
		text: segment.text
	};
}

function isInCore(segment: TranscriptSegment, window: TranscriptionWindow, isLast: boolean) {
	const midpoint = (segment.startSeconds + segment.endSeconds) / 2;
	const afterCoreStart = midpoint >= window.coreStartSeconds;
	const beforeCoreEnd = isLast || midpoint < window.coreEndSeconds;

	return afterCoreStart && beforeCoreEnd;
}
