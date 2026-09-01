/**
 * 같은 글자가 병적으로 이어지는 구간을 줄인다.
 *
 * Whisper 는 조각 경계가 발화와 나쁘게 맞물리면 같은 글자를 수백 번 뽑는다. 실측에서 자막 하나에
 * "오" 가 444자 들어간 적이 있고, 그 조각은 토큰 한도 445까지 다 쓴 뒤였다. 설정으로는 못 막는다.
 * 창 길이를 바꾸면 그 자리에서는 사라지지만 조각 틀이 옮겨간 덕이라 다른 자리에서 다시 난다.
 *
 * **바이트 단위 정규식으로 세면 한글에서 한 건도 안 잡힌다.** 한글이 UTF-8 에서 3바이트라
 * `.` 와 역참조가 바이트에 걸린다. `u` 플래그를 주거나 코드포인트로 끊어야 한다.
 * 이 함정은 실제로 두 번 겪었다.
 */

/**
 * 이보다 길게 이어지면 병적으로 본다. 정상 조건 넷에서 5자 이상 반복이 0건이었고 최장이 3자였다.
 * 그래도 10 으로 잡는 것은 웃음이나 감탄이 다섯 자를 넘는 일이 실제로 흔해서다.
 * 10 이면 실측된 444자 사례를 여전히 잡으면서 여유가 크다.
 */
const REPETITION_LIMIT = 10;

/** 줄일 때 남기는 길이. 정상 발화에서 관측된 최장이 3자다 */
const KEEP_LENGTH = 3;

/** 조각 되풀이를 셀 때 보는 최대 단위. 이보다 길면 문장 구조라 되풀이로 보기 어렵다 */
const MAX_PHRASE_UNIT = 4;
/** 이만큼 넘게 이어져야 병적으로 본다. 실측에서 "느낌이" 4회와 "네요" 48회가 걸린다 */
const MIN_PHRASE_REPEATS = 4;

/** 이웃한 구간이 이만큼 같은 말을 되풀이하면 센다. 두 번은 사람도 한다 */
const MIN_SEGMENT_REPEATS = 3;

export interface TrimmedText {
	text: string;
	/** 줄이면서 없앤 글자 수. 0 이면 손대지 않았다 */
	trimmedChars: number;
}

/**
 * 두 글자 이상인 조각이 연달아 되풀이되는 양을 센다. 자르지는 않는다.
 *
 * 한 글자 반복만 보는 검사는 이것을 놓친다. 실측에서 "네요" 가 48번, "느낌이" 가 4번 이어진
 * 자막이 있었는데 `trimRepetition` 은 둘 다 못 잡았다. 그런데 자르지 않는 이유가 있다.
 * 사람도 같은 말을 되풀이하고, 무엇보다 이것이 얼마나 흔한지 우리가 아직 모른다.
 * 세어서 쌓아 두고 자를지는 그 자료를 보고 정한다.
 *
 * 같은 자리를 단위 크기마다 겹쳐 세지 않도록 이미 센 범위는 건너뛴다.
 */
export function countPhraseRepetition(text: string): number {
	const chars = Array.from(text.replace(/\s/g, ''));
	const counted = new Array<boolean>(chars.length).fill(false);
	let total = 0;

	// 긴 단위부터 봐야 짧은 단위가 같은 자리를 먼저 먹지 않는다
	for (let unit = MAX_PHRASE_UNIT; unit >= 2; unit -= 1) {
		for (let start = 0; start + unit * MIN_PHRASE_REPEATS <= chars.length; start += 1) {
			if (counted[start]) {
				continue;
			}

			const pattern = chars.slice(start, start + unit).join('');
			let repeats = 1;
			while (chars.slice(start + repeats * unit, start + (repeats + 1) * unit).join('') === pattern) {
				repeats += 1;
			}

			if (repeats < MIN_PHRASE_REPEATS) {
				continue;
			}

			const span = repeats * unit;
			total += (repeats - 1) * unit;
			counted.fill(true, start, start + span);
		}
	}

	return total;
}

export function trimRepetition(text: string): TrimmedText {
	// u 플래그가 있어야 코드포인트 단위로 걸린다
	const runs = new RegExp(`(.)\\1{${REPETITION_LIMIT - 1},}`, 'gu');
	let trimmedChars = 0;

	const next = text.replace(runs, (run, char: string) => {
		const kept = char.repeat(KEEP_LENGTH);
		trimmedChars += Array.from(run).length - KEEP_LENGTH;

		return kept;
	});

	return { text: next, trimmedChars };
}

/**
 * 이웃한 구간이 같은 말을 되풀이하는 글자 수를 센다. 자르지 않는다.
 *
 * 한 구간 안에서 세는 `countPhraseRepetition` 은 이것을 못 잡는다. 실측에서 "느낌이" 가
 * **자막 네 개에 걸쳐** 반복된 적이 있는데 각 자막 안에서는 한 번씩이라 안 걸렸다.
 * 되풀이가 구간 경계를 넘을 수 있다는 것이 이 함수가 따로 있는 이유다.
 */
export function countRepeatedSegments(texts: readonly string[]): number {
	let total = 0;
	let run = 1;

	for (let i = 1; i <= texts.length; i += 1) {
		const same = i < texts.length && texts[i].trim() === texts[i - 1].trim() && texts[i].trim().length > 0;
		if (same) {
			run += 1;
			continue;
		}

		if (run >= MIN_SEGMENT_REPEATS) {
			total += (run - 1) * Array.from(texts[i - 1].replace(/\s/g, '')).length;
		}
		run = 1;
	}

	return total;
}
