import { describe, expect, it } from 'vitest';

import { countPhraseRepetition, countRepeatedSegments, trimRepetition } from './transcribe.repetition';

describe('trimRepetition', () => {
	it('실측된 444자 반복을 줄인다', () => {
		const text = `하루 일정 짜주는 거나 이런 기능들을 좀 해볼 수 있을 것 같습니다. ${'오'.repeat(444)} 그래서 일단 여기까지`;
		const result = trimRepetition(text);

		expect(result.trimmedChars).toBe(441);
		expect(result.text).toContain('오오오');
		expect(result.text).not.toContain('오오오오');
	});

	it('반복 앞뒤의 정상 문장은 그대로 남는다', () => {
		const text = `앞 문장이다 ${'가'.repeat(50)} 뒤 문장이다`;

		expect(trimRepetition(text).text).toContain('앞 문장이다');
		expect(trimRepetition(text).text).toContain('뒤 문장이다');
	});

	it('정상 발화의 짧은 반복은 손대지 않는다', () => {
		// 다섯 조건 실측에서 최장이 3자였다
		for (const text of ['ㅋㅋㅋ 웃기네요', '우와아 대단하네요', '네네 알겠습니다']) {
			expect(trimRepetition(text)).toEqual({ text, trimmedChars: 0 });
		}
	});

	it('문턱 바로 아래는 손대지 않고 바로 위는 줄인다', () => {
		const below = '가'.repeat(9);
		const above = '가'.repeat(10);

		expect(trimRepetition(below).trimmedChars).toBe(0);
		expect(trimRepetition(above).trimmedChars).toBe(7);
	});

	/**
	 * 바이트 단위 정규식은 한글에서 한 건도 못 잡는다. 이 검사가 그 회귀를 막는다.
	 * 실제로 `grep -oE "(.)\1{9,}"` 가 444자 반복에 0건을 냈다.
	 */
	it('한글 같은 여러 바이트 글자도 잡는다', () => {
		expect(trimRepetition('오'.repeat(20)).trimmedChars).toBe(17);
		expect(trimRepetition('a'.repeat(20)).trimmedChars).toBe(17);
	});

	it('반복이 없으면 그대로 돌려준다', () => {
		const text = '평범한 문장입니다';

		expect(trimRepetition(text)).toEqual({ text, trimmedChars: 0 });
	});
});

describe('countPhraseRepetition', () => {
	it('실측된 조각 되풀이를 센다', () => {
		// 69분 30초에 "네요" 가 48번, 79분 20초에 "느낌이" 가 4번 이어졌다
		expect(countPhraseRepetition('네요'.repeat(48))).toBeGreaterThan(80);
		expect(countPhraseRepetition('느낌이'.repeat(4))).toBe(9);
	});

	it('사람이 실제로 하는 짧은 되풀이는 안 센다', () => {
		for (const text of ['네 네 알겠습니다', '아 아 그렇군요', '그래서 그래서 어떻게 됐어요']) {
			expect(countPhraseRepetition(text)).toBe(0);
		}
	});

	it('평범한 문장은 0이다', () => {
		expect(countPhraseRepetition('오늘 회의에서 정할 것이 세 가지 있습니다')).toBe(0);
	});

	/** 같은 자리를 단위 크기마다 겹쳐 세면 실제보다 부풀려진다 */
	it('같은 자리를 두 번 세지 않는다', () => {
		const text = '네요'.repeat(48);

		expect(countPhraseRepetition(text)).toBeLessThan(Array.from(text).length);
	});

	it('자르지 않는다. 세기만 한다', () => {
		const text = '네요'.repeat(48);

		expect(trimRepetition(text).text).toBe(text);
		expect(trimRepetition(text).trimmedChars).toBe(0);
	});
});

describe('countRepeatedSegments', () => {
	/** 실측: "느낌이" 가 자막 네 개에 걸쳐 반복됐고 구간 안에서 세는 검사는 못 잡았다 */
	it('구간 경계를 넘는 되풀이를 센다', () => {
		expect(countRepeatedSegments(['느낌이', '느낌이', '느낌이', '느낌이'])).toBe(9);
	});

	it('두 번 되풀이는 안 센다. 사람도 그렇게 말한다', () => {
		expect(countRepeatedSegments(['네', '네'])).toBe(0);
		expect(countRepeatedSegments(['그래서', '그래서'])).toBe(0);
	});

	it('서로 다른 말은 0이다', () => {
		expect(countRepeatedSegments(['안녕하세요', '반갑습니다', '앉으세요'])).toBe(0);
	});

	it('빈 구간은 세지 않는다', () => {
		expect(countRepeatedSegments(['', '', '', ''])).toBe(0);
	});

	/** 구간 안 되풀이와 구간 사이 되풀이는 다른 검사가 필요하다 */
	it('구간 안에서 세는 검사는 이것을 못 잡는다', () => {
		expect(countPhraseRepetition('느낌이')).toBe(0);
		expect(countRepeatedSegments(['느낌이', '느낌이', '느낌이', '느낌이'])).toBeGreaterThan(0);
	});
});
