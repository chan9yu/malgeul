import type { SilenceGap } from './audio.silence';
import { WHISPER_CHUNK_SECONDS, WHISPER_STRIDE_SECONDS } from './model.config';
import type { TranscriptSegment } from './types';

/** 창 경계에서 말이 잘리지 않도록 앞뒤로 덧붙여 모델에 넘기는 길이 */
export const WINDOW_OVERLAP_SECONDS = 5;

/** 진행률 칸 수의 목표. 영상 길이를 이 수로 나눈 값에 가장 가까운 창을 고른다 */
const WINDOW_TARGET_COUNT = 16;
/** 창을 더 잘게 잡으면 겹침 몫이 커져 오히려 느려진다. 90초 영상에서 1.250 까지 나빠졌다 */
const MIN_WINDOW_STEPS = 3;
const MAX_WINDOW_STEPS = 9;

/** 보수적인 쪽부터 본다. 조각이 확실히 적을 때만 갈아탄다 */
const SILENCE_CANDIDATE_SECONDS = [Number.POSITIVE_INFINITY, 30, 20, 10];

export interface TranscriptionWindow {
	/** 이 창이 결과를 책임지는 범위. 창끼리 겹치지 않는다 */
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

interface SpeechRange {
	startSeconds: number;
	endSeconds: number;
}

export interface WindowPlan {
	windows: TranscriptionWindow[];
	windowSeconds: number;
	/** 창 순서대로 각 창이 뜨는 조각 수. 창별 시간과 짝지어 인코더 몫을 가른다 */
	chunkCounts: number[];
	/** 실제로 건너뛴 구간. 빠진 문장이 이 안에 드는지 대조하는 자리다 */
	skippedRanges: SilenceGap[];
	silenceGapCount: number;
	/** 고른 문턱값. 무한대면 아무 무음도 건너뛰지 않았다는 뜻이다 */
	minSilenceSeconds: number;
	skippedSilenceSeconds: number;
	chunkCount: number;
}

const chunkJumpSeconds = () => WHISPER_CHUNK_SECONDS - 2 * WHISPER_STRIDE_SECONDS;

/**
 * 창에 겹침을 더한 길이가 `30 + k*전진폭` 이면 조각이 남김없이 떨어진다. 어기면 조각이 하나씩
 * 더 생겨 이득이 사라진다. stride 3 에 창 120 이 그런 경우로 기준 대비 0.994 였다.
 */
export function alignedWindowSeconds(totalSeconds: number) {
	const jump = chunkJumpSeconds();
	const target = totalSeconds / WINDOW_TARGET_COUNT;
	const raw = Math.floor((target + 2 * WINDOW_OVERLAP_SECONDS - WHISPER_CHUNK_SECONDS) / jump);
	const steps = Math.min(MAX_WINDOW_STEPS, Math.max(MIN_WINDOW_STEPS, raw));

	return WHISPER_CHUNK_SECONDS + steps * jump - 2 * WINDOW_OVERLAP_SECONDS;
}

/** 조각 하나가 길이와 무관하게 늘 30초로 인코딩되므로 이 수가 곧 비용이다 */
export function countChunksPerWindow(windows: readonly TranscriptionWindow[]) {
	const jump = chunkJumpSeconds();

	return windows.map((window) => {
		const length = window.sliceEndSeconds - window.sliceStartSeconds;
		let count = 1;

		for (let offset = 0; offset + WHISPER_CHUNK_SECONDS < length; offset += jump) {
			count += 1;
		}

		return count;
	});
}

export function countChunks(windows: readonly TranscriptionWindow[]) {
	return countChunksPerWindow(windows).reduce((total, count) => total + count, 0);
}

function toSpeechRanges(totalSeconds: number, gaps: readonly SilenceGap[], minSilenceSeconds: number) {
	const ranges: SpeechRange[] = [];
	let cursor = 0;

	for (const gap of gaps) {
		if (gap.endSeconds - gap.startSeconds < minSilenceSeconds) {
			continue;
		}

		if (gap.startSeconds > cursor) {
			ranges.push({ startSeconds: cursor, endSeconds: gap.startSeconds });
		}
		cursor = Math.max(cursor, gap.endSeconds);
	}

	if (cursor < totalSeconds) {
		ranges.push({ startSeconds: cursor, endSeconds: totalSeconds });
	}

	return ranges;
}

function planOverRanges(ranges: readonly SpeechRange[], windowSeconds: number) {
	const windows: TranscriptionWindow[] = [];

	for (const range of ranges) {
		for (let coreStart = range.startSeconds; coreStart < range.endSeconds; coreStart += windowSeconds) {
			const coreEnd = Math.min(coreStart + windowSeconds, range.endSeconds);
			windows.push({
				coreStartSeconds: coreStart,
				coreEndSeconds: coreEnd,
				sliceStartSeconds: Math.max(range.startSeconds, coreStart - WINDOW_OVERLAP_SECONDS),
				sliceEndSeconds: Math.min(range.endSeconds, coreEnd + WINDOW_OVERLAP_SECONDS)
			});
		}
	}

	return windows;
}

/**
 * 짧은 무음을 건너뛰면 구간마다 겹침이 새로 붙어 오히려 느려진다. 말이 30초씩 끊기는 내용에서
 * 3초 기준이 1.42배였다. 그래서 후보를 견주어 조각이 가장 적은 계획을 고른다.
 */
export function planWindowsWithPlan(totalSeconds: number, gaps: readonly SilenceGap[] = []): WindowPlan {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
		return {
			windows: [],
			windowSeconds: 0,
			chunkCounts: [],
			skippedRanges: [],
			silenceGapCount: gaps.length,
			minSilenceSeconds: Infinity,
			skippedSilenceSeconds: 0,
			chunkCount: 0
		};
	}

	const windowSeconds = alignedWindowSeconds(totalSeconds);
	let best: WindowPlan | null = null;

	for (const minSilenceSeconds of SILENCE_CANDIDATE_SECONDS) {
		const skippedRanges = gaps.filter((gap) => gap.endSeconds - gap.startSeconds >= minSilenceSeconds);
		const ranges = toSpeechRanges(totalSeconds, gaps, minSilenceSeconds);
		const windows = planOverRanges(ranges, windowSeconds);
		const chunkCounts = countChunksPerWindow(windows);
		const chunkCount = chunkCounts.reduce((total, count) => total + count, 0);

		if (best !== null && chunkCount >= best.chunkCount) {
			continue;
		}

		const covered = ranges.reduce((sum, range) => sum + (range.endSeconds - range.startSeconds), 0);
		best = {
			windows,
			windowSeconds,
			chunkCounts,
			skippedRanges,
			silenceGapCount: gaps.length,
			minSilenceSeconds,
			skippedSilenceSeconds: Math.max(0, totalSeconds - covered),
			chunkCount
		};
	}

	return (
		best ?? {
			windows: [],
			windowSeconds,
			chunkCounts: [],
			skippedRanges: [],
			silenceGapCount: gaps.length,
			minSilenceSeconds: Infinity,
			skippedSilenceSeconds: 0,
			chunkCount: 0
		}
	);
}

export function planWindows(totalSeconds: number, gaps: readonly SilenceGap[] = []): TranscriptionWindow[] {
	return planWindowsWithPlan(totalSeconds, gaps).windows;
}

/**
 * 다음 창의 core 가 떨어져 시작하면 거기가 말 구간의 끝이다. core 를 넘긴 문장을 그 자리에서
 * 안 살리면 어느 창에도 안 들어가 조용히 사라진다.
 */
export function mergeWindows(results: readonly WindowResult[]): TranscriptSegment[] {
	return results.flatMap((result, index) => {
		const next = results[index + 1];
		const atRangeEnd = next === undefined || next.window.coreStartSeconds > result.window.coreEndSeconds;

		return keepCoreSegments(result, atRangeEnd);
	});
}

function keepCoreSegments(result: WindowResult, atRangeEnd: boolean) {
	const shifted = result.segments.map((segment) => shiftSegment(segment, result.window.sliceStartSeconds));

	return shifted.filter((segment) => isInCore(segment, result.window, atRangeEnd));
}

function shiftSegment(segment: TranscriptSegment, offsetSeconds: number): TranscriptSegment {
	return {
		startSeconds: segment.startSeconds + offsetSeconds,
		endSeconds: segment.endSeconds + offsetSeconds,
		text: segment.text
	};
}

function isInCore(segment: TranscriptSegment, window: TranscriptionWindow, atRangeEnd: boolean) {
	const midpoint = (segment.startSeconds + segment.endSeconds) / 2;
	const afterCoreStart = midpoint >= window.coreStartSeconds;
	const beforeCoreEnd = atRangeEnd || midpoint < window.coreEndSeconds;

	return afterCoreStart && beforeCoreEnd;
}
