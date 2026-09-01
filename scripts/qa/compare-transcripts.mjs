// 두 변환 결과를 대조한다. 성능을 올린 변경이 문장을 떨어뜨렸는지 보는 자리다.
//
// 문장 수만 세면 알 수 없다. 구간을 자르면 한 문장이 둘로 갈리거나 둘이 하나로 합쳐져
// 개수가 흔들리고, 그 변동에 진짜 누락이 묻힌다. 그래서 시간이 겹치는 자막을 짝지어
// 짝이 없는 구간을 따로 센다.
//
// 사용법: node scripts/qa/compare-transcripts.mjs <기준 srt> <비교 srt>

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const BUCKET_SECONDS = 600;
const SAMPLE_LIMIT = 10;
const SAMPLE_TEXT_LIMIT = 70;
/** 같은 글자가 이만큼 이어지면 모델이 반복에 빠진 것으로 본다 */
const REPEAT_MIN = 10;
/**
 * 초당 글자 수를 재는 문턱들. 하나로 정하지 않는 이유는 정상과 비정상의 경계가 흐려서다.
 * 여러 값에서 함께 세면 읽는 사람이 문턱을 옮겨 보며 결론이 얼마나 흔들리는지 안다.
 */
/**
 * 짧은 구가 되풀이되는 자리. "네요 네요 네요..." 처럼 글자 하나가 아니라 구 단위라
 * 글자 반복 검사로는 안 걸린다. 다섯 번 넘게 이어질 때만 센다.
 */
const PHRASE_RUN = /(.{2,12}?)\1{4,}/g;
/** 연속한 자막이 같거나 한쪽이 다른 쪽을 품는 자리. 이만큼 이어지면 센다 */
const CUE_RUN_MIN = 3;
const DENSITY_MARKS = [20, 25, 30];
const DENSITY_TOP = 3;
// 셸 grep 의 (.)\\1 은 한글을 못 잡는다. UTF-8 에서 3바이트라 역참조가 바이트로 걸린다.
// 자바스크립트 정규식은 코드유닛 단위라 한글이 한 글자로 잡힌다
const REPEAT_RUN = /(.)\1{9,}/g;

function parseTime(stamp) {
	const [hours, minutes, rest] = stamp.trim().split(':');
	const [seconds, millis] = rest.split(',');

	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function parseSrt(raw) {
	const cues = [];

	for (const block of raw.trim().split(/\r?\n\r?\n+/)) {
		const lines = block.split(/\r?\n/);
		const timingAt = lines.findIndex((line) => line.includes(' --> '));
		if (timingAt < 0) {
			continue;
		}

		const [from, to] = lines[timingAt].split(' --> ');
		const start = parseTime(from);
		const end = parseTime(to);
		if (!Number.isFinite(start) || !Number.isFinite(end)) {
			continue;
		}

		const text = lines
			.slice(timingAt + 1)
			.join(' ')
			.trim();
		cues.push({ start, end, text });
	}

	return cues.sort((left, right) => left.start - right.start);
}

/** 겹치는 구간을 합쳐 실제로 말이 있던 초를 낸다. 겹침을 그대로 더하면 오디오보다 길어진다 */
function spokenSeconds(cues) {
	if (cues.length === 0) {
		return 0;
	}

	let total = 0;
	let spanStart = cues[0].start;
	let spanEnd = cues[0].end;

	for (const cue of cues.slice(1)) {
		if (cue.start <= spanEnd) {
			spanEnd = Math.max(spanEnd, cue.end);
			continue;
		}

		total += spanEnd - spanStart;
		spanStart = cue.start;
		spanEnd = cue.end;
	}

	return total + spanEnd - spanStart;
}

function countOverlaps(cues) {
	let overlaps = 0;
	for (let index = 1; index < cues.length; index += 1) {
		if (cues[index].start < cues[index - 1].end) {
			overlaps += 1;
		}
	}

	return overlaps;
}

/**
 * 같은 글자가 이어지는 자리를 찾는다. 모델이 반복에 빠지면 없는 말이 수백 자 생기는데,
 * 자막 하나라 개수에 묻히고 글자 수 총합은 오히려 늘어 정상으로 보인다.
 */
function findRepeats(cues) {
	return cues.flatMap((cue) => {
		const runs = cue.text.match(REPEAT_RUN);
		if (!runs) {
			return [];
		}

		return [{ at: cue.start, letter: runs[0][0], length: runs.reduce((sum, run) => sum + run.length, 0) }];
	});
}

/**
 * 짧은 시간에 긴 글이 담긴 자막을 찾는다. 타임스탬프가 뭉개지면 이렇게 나오는데
 * 반복 검사로는 안 걸린다. 문턱을 판정으로 쓰지 않고 값을 그대로 보여 준다.
 */
function densityStats(cues) {
	const rated = cues
		.filter((cue) => cue.end > cue.start)
		.map((cue) => ({ cue, rate: cue.text.length / (cue.end - cue.start) }))
		.sort((left, right) => right.rate - left.rate);

	return {
		top: rated.slice(0, DENSITY_TOP),
		counts: DENSITY_MARKS.map((mark) => rated.filter((entry) => entry.rate > mark).length)
	};
}

function findPhraseRepeats(cues) {
	return cues.flatMap((cue) => {
		const runs = cue.text.match(PHRASE_RUN);
		if (!runs) {
			return [];
		}

		const longest = runs.reduce((best, run) => (run.length > best.length ? run : best), runs[0]);

		return [
			{
				at: cue.start,
				sample: longest.slice(0, 12).trim(),
				length: longest.length,
				bare: longest.replace(/\s/g, '').length
			}
		];
	});
}

/** 앞 자막과 같거나 한쪽이 다른 쪽을 품으면 같은 말로 본다 */
function sameSpeech(left, right) {
	const a = normalize(left);
	const b = normalize(right);
	if (a.length === 0 || b.length === 0) {
		return false;
	}

	return a === b || a.includes(b) || b.includes(a);
}

function findCueRepeats(cues) {
	const found = [];
	let run = 1;

	for (let index = 1; index <= cues.length; index += 1) {
		const linked = index < cues.length && sameSpeech(cues[index - 1].text, cues[index].text);
		if (linked) {
			run += 1;
			continue;
		}

		if (run >= CUE_RUN_MIN) {
			found.push({ at: cues[index - run].start, text: cues[index - 1].text, count: run });
		}
		run = 1;
	}

	return found;
}

function bucketCounts(cues, limitSeconds) {
	const size = Math.max(1, Math.ceil(limitSeconds / BUCKET_SECONDS));
	const counts = new Array(size).fill(0);

	for (const cue of cues) {
		counts[Math.min(Math.floor(cue.start / BUCKET_SECONDS), size - 1)] += 1;
	}

	return counts;
}

/** 정렬된 두 목록을 훑어 상대쪽에 시간이 겹치는 자막이 없는 것을 모은다 */
function findOrphans(source, target) {
	const orphans = [];
	let cursor = 0;

	for (const cue of source) {
		while (cursor < target.length && target[cursor].end <= cue.start) {
			cursor += 1;
		}

		let matched = false;
		for (let index = cursor; index < target.length && target[index].start < cue.end; index += 1) {
			if (target[index].end > cue.start) {
				matched = true;
				break;
			}
		}

		if (!matched) {
			orphans.push(cue);
		}
	}

	return orphans;
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * 겹치는 길이가 아니라 겹치는 비율로 짝을 고른다. 한 자막이 다른 자막을 통째로 품으면
 * 겹치는 길이가 같아져 이웃을 짝으로 오인한다. 비율은 같은 자막일 때만 1 이다.
 */
function pickSamples(base, next) {
	const differing = [];
	let cursor = 0;

	for (const cue of base) {
		while (cursor < next.length && next[cursor].end <= cue.start) {
			cursor += 1;
		}

		let best = null;
		let bestScore = 0;
		for (let index = cursor; index < next.length && next[index].start < cue.end; index += 1) {
			const overlap = Math.min(next[index].end, cue.end) - Math.max(next[index].start, cue.start);
			const union = Math.max(next[index].end, cue.end) - Math.min(next[index].start, cue.start);
			const score = union > 0 ? overlap / union : 0;
			if (score > bestScore) {
				bestScore = score;
				best = next[index];
			}
		}

		if (best && normalize(best.text) !== normalize(cue.text)) {
			differing.push({ at: cue.start, base: cue.text, next: best.text });
		}
	}

	if (differing.length <= SAMPLE_LIMIT) {
		return differing;
	}

	const step = differing.length / SAMPLE_LIMIT;

	return Array.from({ length: SAMPLE_LIMIT }, (_, slot) => differing[Math.floor(slot * step)]);
}

const clock = (seconds) => {
	const whole = Math.floor(seconds);
	const mm = String(Math.floor(whole / 60)).padStart(2, '0');
	const ss = String(whole % 60).padStart(2, '0');

	return `${mm}:${ss}`;
};

const shorten = (text) => (text.length > SAMPLE_TEXT_LIMIT ? `${text.slice(0, SAMPLE_TEXT_LIMIT)}...` : text);

const delta = (before, after) => {
	const diff = after - before;
	const sign = diff > 0 ? '+' : '';

	return `${sign}${diff.toFixed(diff % 1 === 0 ? 0 : 1)}`;
};

const [basePath, nextPath] = process.argv.slice(2);
if (!basePath || !nextPath) {
	console.error('사용법: node scripts/qa/compare-transcripts.mjs <기준 srt> <비교 srt>');
	process.exit(1);
}

const base = parseSrt(await readFile(basePath, 'utf8'));
const next = parseSrt(await readFile(nextPath, 'utf8'));

// 아무것도 읽지 못했는데 차이 0 을 통과로 읽으면 실패가 통과로 찍힌다
if (base.length === 0 || next.length === 0) {
	console.error(`측정 불성립: 자막을 읽지 못했다. 기준 ${base.length}개, 비교 ${next.length}개`);
	process.exit(1);
}

const span = Math.max(base.at(-1).end, next.at(-1).end);
const baseSpoken = spokenSeconds(base);
const nextSpoken = spokenSeconds(next);
const lost = findOrphans(base, next);
const gained = findOrphans(next, base);

console.log(`기준: ${basename(basePath)}`);
console.log(`비교: ${basename(nextPath)}`);
console.log(`\n${'항목'.padEnd(22)}${'기준'.padStart(10)}${'비교'.padStart(10)}${'차이'.padStart(10)}`);
console.log('-'.repeat(52));

const baseRepeats = findRepeats(base);
const nextRepeats = findRepeats(next);
const baseRepeatChars = baseRepeats.reduce((sum, hit) => sum + hit.length, 0);
const nextRepeatChars = nextRepeats.reduce((sum, hit) => sum + hit.length, 0);
const baseChars = base.reduce((sum, cue) => sum + cue.text.length, 0);
const baseChars2 = base.reduce((sum, cue) => sum + cue.text.replace(/\s/g, '').length, 0);
const nextChars2 = next.reduce((sum, cue) => sum + cue.text.replace(/\s/g, '').length, 0);
const nextChars = next.reduce((sum, cue) => sum + cue.text.length, 0);

/**
 * 되풀이와 공백을 뺀 글자 수. 총합만 보면 되풀이가 늘어난 것을 내용이 는 것으로 읽는다.
 * 자막 사이 되풀이는 첫 하나만 남기고 나머지를 뺀다.
 */
function netContent(cues, phrases, repeats) {
	const total = cues.reduce((sum, cue) => sum + cue.text.replace(/\s/g, '').length, 0);
	const inside = phrases.reduce((sum, hit) => sum + hit.bare, 0);
	const between = repeats.reduce((sum, hit) => sum + (hit.count - 1) * hit.text.replace(/\s/g, '').length, 0);

	return total - inside - between;
}

const basePhrases = findPhraseRepeats(base);
const nextPhrases = findPhraseRepeats(next);
const baseCueRuns = findCueRepeats(base);
const nextCueRuns = findCueRepeats(next);

const rows = [
	['자막 수', base.length, next.length],
	['말이 있던 초', Math.round(baseSpoken), Math.round(nextSpoken)],
	['시간 겹친 자막', countOverlaps(base), countOverlaps(next)],
	['글자 수', baseChars, nextChars],
	['그 가운데 반복 글자', baseRepeatChars, nextRepeatChars],
	['반복 뺀 글자 수', baseChars - baseRepeatChars, nextChars - nextRepeatChars],
	['공백 뺀 글자 수', baseChars2, nextChars2],
	['되풀이와 공백 뺀 순내용', netContent(base, basePhrases, baseCueRuns), netContent(next, nextPhrases, nextCueRuns)],
	['마지막 자막 끝(초)', Math.round(base.at(-1).end), Math.round(next.at(-1).end)]
];

for (const [label, before, after] of rows) {
	console.log(
		label.padEnd(20) + String(before).padStart(10) + String(after).padStart(10) + delta(before, after).padStart(10)
	);
}

console.log(`\n10분 구간별 자막 수`);
const baseBuckets = bucketCounts(base, span);
const nextBuckets = bucketCounts(next, span);
for (let slot = 0; slot < baseBuckets.length; slot += 1) {
	const from = String(slot * 10).padStart(3);
	const to = String((slot + 1) * 10).padStart(3);
	const line =
		`${from}-${to}분` +
		String(baseBuckets[slot]).padStart(10) +
		String(nextBuckets[slot]).padStart(10) +
		delta(baseBuckets[slot], nextBuckets[slot]).padStart(10);
	console.log(line);
}

if (baseRepeats.length > 0 || nextRepeats.length > 0) {
	console.log(`\n같은 글자가 ${REPEAT_MIN}자 이상 이어지는 자막`);
	console.log(`  기준 ${baseRepeats.length}개, 비교 ${nextRepeats.length}개`);
	for (const [label, hits] of [
		['기준', baseRepeats],
		['비교', nextRepeats]
	]) {
		for (const hit of hits) {
			console.log(`  ${label} [${clock(hit.at)}] "${hit.letter}" ${hit.length}자`);
		}
	}
}

const baseDensity = densityStats(base);
const nextDensity = densityStats(next);
console.log(`\n자막 밀도. 정상 발화는 초당 5 에서 7자다`);
for (const [label, stats] of [
	['기준', baseDensity],
	['비교', nextDensity]
]) {
	const marks = DENSITY_MARKS.map((mark, index) => `${mark}자 넘음 ${stats.counts[index]}건`).join(', ');
	const peak = stats.top[0] ? `${Math.round(stats.top[0].rate)}자/초` : '없음';
	console.log(`  ${label}: 최대 ${peak}, ${marks}`);
}

for (const [label, stats] of [
	['기준', baseDensity],
	['비교', nextDensity]
]) {
	for (const entry of stats.top) {
		const seconds = entry.cue.end - entry.cue.start;
		console.log(
			`  ${label} [${clock(entry.cue.start)}] ${seconds.toFixed(2)}초에 ${entry.cue.text.length}자 = ${Math.round(entry.rate)}자/초`
		);
	}
}

for (const [label, cues] of [
	['기준', base],
	['비교', next]
]) {
	const phrases = findPhraseRepeats(cues);
	const repeats = findCueRepeats(cues);
	console.log(`\n${label} 되풀이: 자막 안 ${phrases.length}건, 자막 사이 ${repeats.length}건`);
	for (const hit of phrases.slice(0, 3)) {
		console.log(`  [${clock(hit.at)}] 자막 안에서 "${hit.sample}" 이 ${hit.length}자에 걸쳐 되풀이`);
	}
	for (const hit of repeats.slice(0, 3)) {
		console.log(`  [${clock(hit.at)}] "${shorten(hit.text)}" 이 자막 ${hit.count}개에 걸쳐 되풀이`);
	}
}

console.log(`\n짝이 없는 구간`);
console.log(`  기준에만 있고 비교본에 없다: ${lost.length}개 (${Math.round(spokenSeconds(lost))}초)`);
console.log(`  비교본에만 있고 기준에 없다: ${gained.length}개 (${Math.round(spokenSeconds(gained))}초)`);

for (const cue of lost.slice(0, SAMPLE_LIMIT)) {
	console.log(`  [${clock(cue.start)}] ${shorten(cue.text)}`);
}

if (lost.length > SAMPLE_LIMIT) {
	console.log(`  ...그 밖 ${lost.length - SAMPLE_LIMIT}개`);
}

const samples = pickSamples(base, next);
console.log(`\n같은 구간에서 글이 달라진 표본 (${samples.length}개)`);
for (const sample of samples) {
	console.log(`  [${clock(sample.at)}]`);
	console.log(`    기준: ${shorten(sample.base)}`);
	console.log(`    비교: ${shorten(sample.next)}`);
}
