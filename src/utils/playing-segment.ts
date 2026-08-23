export const NO_PLAYING_SEGMENT = -1;

/**
 * 플레이어를 시작 시각으로 옮기면 그 자리에 정확히 서지 않고 백만분의 일 초쯤 앞에 선다.
 * 그대로 견주면 방금 누른 문장이 아직 시작하지 않은 것이 되어 앞 문장이 강조된다.
 * 시각을 밀리초까지만 적으므로 그 아래 차이는 같은 자리로 본다
 */
const SEEK_TOLERANCE_SECONDS = 0.001;

interface SegmentStart {
	readonly startSeconds: number;
}

/**
 * 재생 중인 문장의 자리. 시작 시각 이상이고 다음 문장의 시작 시각 미만인 문장이다.
 * 마지막 문장에는 다음이 없어 영상 끝까지 이어진다. 첫 문장이 시작하기 전에는 재생 중인 문장이 없다
 */
export function findPlayingSegmentIndex(segments: readonly SegmentStart[], currentSeconds: number) {
	for (let index = segments.length - 1; index >= 0; index -= 1) {
		if (currentSeconds >= segments[index].startSeconds - SEEK_TOLERANCE_SECONDS) {
			return index;
		}
	}

	return NO_PLAYING_SEGMENT;
}
