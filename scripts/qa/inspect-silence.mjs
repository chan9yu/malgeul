// 음성 추출과 무음 검출, 창 계획까지만 돌려 건너뛴 구간을 뽑는다.
// Whisper 를 안 태우므로 80분 파일도 몇 분이면 끝난다. 검출과 계획은 모델과 무관하게
// PCM 만 보기 때문에 여기서 나온 값이 실제 변환에서 쓰는 값과 같다.
//
// 사용법: node scripts/qa/inspect-silence.mjs <영상>

import { spawn } from 'node:child_process';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { readBase } from './base-url.mjs';
import { createEvaluate, findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

const POLL_MS = 2_000;
const IDLE_LIMIT_MS = 600_000;

const source = process.argv[2];
if (!source) {
	console.error('사용법: node scripts/qa/inspect-silence.mjs <영상>');
	process.exit(1);
}

const sourcePath = resolve(source);
await access(sourcePath);

const port = await findFreePort();
const base = await readBase();
const url = `http://localhost:${port}${base}`;

const servedName = 'qa-transcribe-source' + extname(sourcePath);
const servedPath = join('public', servedName);
await writeFile(servedPath, await readFile(sourcePath));

const START = `(async () => {
	const { extractAudio } = await import('${base}src/services/audio.extractor.ts');
	const { findSilenceGaps } = await import('${base}src/services/audio.silence.ts');
	const { planWindowsWithPlan } = await import('${base}src/services/transcribe.window.ts');

	window.qaSilence = { done: false, error: null, result: null };
	(async () => {
		const bytes = await (await fetch('${base}${servedName}')).arrayBuffer();
		const file = new File([bytes], ${JSON.stringify(basename(sourcePath))}, { type: 'video/mp4' });
		const audio = await extractAudio(file);
		const gaps = findSilenceGaps(audio.pcm, audio.sampleRate);
		const plan = planWindowsWithPlan(audio.durationSeconds, gaps);

		window.qaSilence = {
			done: true,
			error: null,
			result: {
				durationSeconds: audio.durationSeconds,
				detectedGaps: gaps,
				windowSeconds: plan.windowSeconds,
				windowCount: plan.windows.length,
				chunkCount: plan.chunkCount,
				chunkCounts: plan.chunkCounts,
				skippedRanges: plan.skippedRanges,
				minSilenceSeconds: Number.isFinite(plan.minSilenceSeconds) ? plan.minSilenceSeconds : null,
				coreBounds: plan.windows.map((w) => [w.coreStartSeconds, w.coreEndSeconds])
			}
		};
	})().catch((cause) => {
		const detail = cause && cause.cause !== undefined && cause.cause !== null ? String(cause.cause) : null;
		window.qaSilence = { done: true, error: detail ?? String(cause && cause.message ? cause.message : cause), result: null };
	});
	return true;
})()`;

const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-silence-' });

try {
	await waitForUrl(url);
	const { send, sessionId } = await chrome.attach();
	await send('Runtime.enable', {}, sessionId);
	await send('Page.navigate', { url }, sessionId);
	await wait(2000);

	const evaluate = createEvaluate(send, sessionId);
	console.log(`파일: ${sourcePath}`);

	const started = await evaluate(START);
	if (started !== true) {
		throw new Error(`시작하지 못했다: ${JSON.stringify(started)}`);
	}

	const startedAt = Date.now();
	let state = null;
	while (true) {
		await wait(POLL_MS);
		state = await evaluate('window.qaSilence ?? null');
		if (state === null) {
			throw new Error('페이지가 다시 불렸다');
		}
		if (state.done) {
			break;
		}
		if (Date.now() - startedAt > IDLE_LIMIT_MS) {
			throw new Error('진행이 없다');
		}
	}

	if (state.error) {
		throw new Error(`검출 실패: ${state.error}`);
	}

	const r = state.result;
	console.log(`\n음성 ${(r.durationSeconds / 60).toFixed(1)}분, 검출한 무음 ${r.detectedGaps.length}구간`);
	console.log(`창 ${r.windowSeconds}초 ${r.windowCount}칸, 조각 ${r.chunkCount}개`);
	console.log(`고른 문턱값 ${r.minSilenceSeconds === null ? '없음(건너뛰기 안 함)' : r.minSilenceSeconds + '초'}`);

	console.log(`\n건너뛴 구간 ${r.skippedRanges.length}개`);
	for (const range of r.skippedRanges) {
		const length = range.endSeconds - range.startSeconds;
		console.log(`  ${range.startSeconds.toFixed(2)} ~ ${range.endSeconds.toFixed(2)}  (${length.toFixed(2)}초)`);
	}

	console.log(`\n검출한 무음 전부 ${r.detectedGaps.length}개 (건너뛰지 않은 것 포함)`);
	for (const gap of r.detectedGaps) {
		const length = gap.endSeconds - gap.startSeconds;
		const used = r.skippedRanges.some((s) => s.startSeconds === gap.startSeconds);
		console.log(
			`  ${gap.startSeconds.toFixed(2)} ~ ${gap.endSeconds.toFixed(2)}  (${length.toFixed(2)}초) ${used ? '건너뜀' : ''}`
		);
	}

	console.log(`\n창 core 경계`);
	console.log(r.coreBounds.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)}`).join(', '));
} finally {
	await chrome.close();
	server.kill();
	await rm(servedPath, { force: true });
}
