/** 건너뛸 수 있는 무음 한 구간. 앞뒤 여유를 이미 깎은 범위다 */
export interface SilenceGap {
	startSeconds: number;
	endSeconds: number;
}

const FRAME_SECONDS = 0.1;
/** 말 구간 앞뒤로 남겨 두는 여유. 찾은 무음에서 이만큼씩 깎아 돌려준다 */
const PADDING_SECONDS = 0.5;
const FLOOR_PERCENTILE = 0.1;
const SPEECH_PERCENTILE = 0.95;
/** 말과 잡음 바닥이 이보다 안 갈리면 아무것도 건너뛰지 않는다 */
const MIN_SEPARATION_DB = 15;
const ABSOLUTE_SILENCE_RMS = 1e-4;
/** 이보다 짧은 무음은 돌려주지 않는다. 창 계획이 고르는 후보의 최소가 10초라 쓰이지 않는다 */
const MIN_GAP_SECONDS = 2;

/**
 * 에너지로 무음을 찾는다. 웹용 VAD 는 CDN 로드가 기본이라 밖으로 나가는 요청을 모델 다운로드
 * 하나로 묶는 제약과 어긋나 직접 잰다. 애매하면 말로 판정한다. 얼마나 긴 무음을 실제로
 * 건너뛸지는 여기서 정하지 않고 창 계획이 조각 수를 세어 고른다.
 */
export function findSilenceGaps(pcm: Float32Array, sampleRate: number): SilenceGap[] {
	const totalSeconds = pcm.length / sampleRate;
	const frameLength = Math.round(FRAME_SECONDS * sampleRate);
	if (frameLength <= 0 || pcm.length < frameLength * 2) {
		return [];
	}

	const rms = toFrameRms(pcm, frameLength);
	const sorted = Float32Array.from(rms).sort();
	const floor = percentileOf(sorted, FLOOR_PERCENTILE);
	const speech = percentileOf(sorted, SPEECH_PERCENTILE);

	if (speech < ABSOLUTE_SILENCE_RMS) {
		return [{ startSeconds: 0, endSeconds: totalSeconds }];
	}

	const separationDb = 20 * Math.log10(speech / Math.max(floor, ABSOLUTE_SILENCE_RMS));
	if (separationDb < MIN_SEPARATION_DB) {
		return [];
	}

	const marginDb = Math.min(12, Math.max(6, 0.25 * separationDb));
	const threshold = Math.max(ABSOLUTE_SILENCE_RMS, floor * 10 ** (marginDb / 20));

	return collectGaps(rms, threshold, totalSeconds);
}

function toFrameRms(pcm: Float32Array, frameLength: number) {
	const count = Math.floor(pcm.length / frameLength);
	const rms = new Float32Array(count);

	for (let frame = 0; frame < count; frame += 1) {
		const start = frame * frameLength;
		let sum = 0;
		for (let i = start; i < start + frameLength; i += 1) {
			sum += pcm[i] * pcm[i];
		}
		rms[frame] = Math.sqrt(sum / frameLength);
	}

	return rms;
}

function percentileOf(sorted: Float32Array, ratio: number) {
	if (sorted.length === 0) {
		return 0;
	}

	const index = Math.min(sorted.length - 1, Math.max(0, Math.round(ratio * (sorted.length - 1))));

	return sorted[index];
}

function collectGaps(rms: Float32Array, threshold: number, totalSeconds: number) {
	const gaps: SilenceGap[] = [];
	let runStart: number | null = null;

	for (let frame = 0; frame <= rms.length; frame += 1) {
		const quiet = frame < rms.length && rms[frame] < threshold;

		if (quiet) {
			runStart ??= frame;
			continue;
		}

		if (runStart !== null) {
			addGap(gaps, runStart * FRAME_SECONDS, frame * FRAME_SECONDS, totalSeconds);
			runStart = null;
		}
	}

	return gaps;
}

/** 녹화 앞뒤의 빈 소리는 바깥쪽에 말이 없으니 그쪽 여유를 깎지 않는다 */
function addGap(gaps: SilenceGap[], rawStart: number, rawEnd: number, totalSeconds: number) {
	const start = rawStart <= 0 ? 0 : rawStart + PADDING_SECONDS;
	const end = rawEnd >= totalSeconds ? totalSeconds : rawEnd - PADDING_SECONDS;

	if (end - start >= MIN_GAP_SECONDS) {
		gaps.push({ startSeconds: start, endSeconds: end });
	}
}
