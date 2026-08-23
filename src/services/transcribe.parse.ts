import type { TranscriptSegment } from './types';

/** 선언된 타입은 시각이 늘 숫자라고 하지만 닫는 타임스탬프가 없는 구간은 끝이 null로 온다 */
export function toSegments(chunks: unknown, fallbackEndSeconds: number): TranscriptSegment[] {
	if (!Array.isArray(chunks)) {
		return [];
	}

	return chunks.flatMap((chunk) => {
		const segment = toSegment(chunk, fallbackEndSeconds);

		return segment ? [segment] : [];
	});
}

function toSegment(chunk: unknown, fallbackEndSeconds: number) {
	if (typeof chunk !== 'object' || chunk === null || !('timestamp' in chunk) || !('text' in chunk)) {
		return null;
	}

	const text = typeof chunk.text === 'string' ? chunk.text.trim() : '';
	if (text.length === 0) {
		return null;
	}

	const { timestamp } = chunk;
	if (!Array.isArray(timestamp)) {
		return null;
	}

	const startSeconds = toSeconds(timestamp[0]);
	if (startSeconds === null) {
		return null;
	}

	const endSeconds = toSeconds(timestamp[1]) ?? fallbackEndSeconds;

	return {
		startSeconds,
		endSeconds: Math.max(startSeconds, endSeconds),
		text
	};
}

function toSeconds(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
