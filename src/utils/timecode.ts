const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const MILLISECONDS_PER_HOUR = MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;

interface TimeParts {
	hours: number;
	minutes: number;
	seconds: number;
	milliseconds: number;
}

/** 세 표기가 같은 값에서 갈라지도록 쪼개는 자리를 하나로 둔다 */
function splitTime(totalSeconds: number): TimeParts {
	const totalMilliseconds = Math.round(Math.max(0, totalSeconds) * MILLISECONDS_PER_SECOND);

	return {
		hours: Math.floor(totalMilliseconds / MILLISECONDS_PER_HOUR),
		minutes: Math.floor((totalMilliseconds % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE),
		seconds: Math.floor((totalMilliseconds % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND),
		milliseconds: totalMilliseconds % MILLISECONDS_PER_SECOND
	};
}

function pad(value: number, length: number) {
	return String(value).padStart(length, '0');
}

/**
 * 문장 목록과 txt, 전체 복사의 시작 시각.
 * 표기를 고르는 기준은 구간이 아니라 영상 길이다. 1시간 미만이면 mm:ss, 이상이면 h:mm:ss로 통일한다
 */
export function formatTimecode(seconds: number, durationSeconds: number) {
	const { hours, minutes, seconds: wholeSeconds } = splitTime(seconds);

	if (splitTime(durationSeconds).hours === 0) {
		return `${pad(minutes, 2)}:${pad(wholeSeconds, 2)}`;
	}

	return `${hours}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}`;
}

/** srt의 HH:MM:SS,mmm */
export function formatSrtTime(seconds: number) {
	const { hours, minutes, seconds: wholeSeconds, milliseconds } = splitTime(seconds);

	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)},${pad(milliseconds, 3)}`;
}

/** vtt의 HH:MM:SS.mmm */
export function formatVttTime(seconds: number) {
	const { hours, minutes, seconds: wholeSeconds, milliseconds } = splitTime(seconds);

	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}.${pad(milliseconds, 3)}`;
}
