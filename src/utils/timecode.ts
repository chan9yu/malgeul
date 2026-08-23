const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

function padTwo(value: number) {
	return String(value).padStart(2, '0');
}

/** 1시간 미만은 mm:ss, 1시간 이상은 h:mm:ss */
export function formatTimecode(seconds: number) {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / SECONDS_PER_HOUR);
	const minutes = Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	const remainingSeconds = whole % SECONDS_PER_MINUTE;

	if (hours === 0) {
		return `${padTwo(minutes)}:${padTwo(remainingSeconds)}`;
	}

	return `${hours}:${padTwo(minutes)}:${padTwo(remainingSeconds)}`;
}
