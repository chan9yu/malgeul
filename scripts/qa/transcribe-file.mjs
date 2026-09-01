// 실제 파일을 앱의 파이프라인 그대로 돌려 결과를 파일로 받는다.
// 화면을 거치지 않을 뿐 코드는 앱이 쓰는 것과 같다. 1시간짜리 실물로 확인하는 자리이면서
// 결과물을 실제로 쓰는 자리이기도 하다.
//
// 사용법: node scripts/qa/transcribe-file.mjs <영상> [출력 폴더]
//
// 모델 563MB 를 처음 한 번 내려받고 변환에 영상 길이만큼 걸릴 수 있다.

import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { readBase } from './base-url.mjs';
import { findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

// 페이지가 다시 불리는 원인이 둘이라 구분에 쓴다. vite 가 의존성을 처음 발견해 최적화하면
// 저장소 파일을 아무도 안 건드려도 full reload 가 걸린다.
// 상위 .vite 에는 vitest 의 캐시도 있어서 게이트를 돌리면 같이 갱신된다. deps 만 본다
const VITE_DEPS_DIR = 'node_modules/.vite/deps';

async function newestViteDepsMtime(dir = VITE_DEPS_DIR) {
	let newest = 0;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return 0;
	}

	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			newest = Math.max(newest, await newestViteDepsMtime(path));
			continue;
		}
		const info = await stat(path).catch(() => null);
		if (info) {
			newest = Math.max(newest, info.mtimeMs);
		}
	}

	return newest;
}

const POLL_MS = 5_000;
const IDLE_LIMIT_MS = 600_000;

const source = process.argv[2];
if (!source) {
	console.error('사용법: node scripts/qa/transcribe-file.mjs <영상> [출력 폴더]');
	process.exit(1);
}

const sourcePath = resolve(source);
await access(sourcePath);

const outDir = resolve(process.argv[3] ?? '_workspace/transcripts');
await mkdir(outDir, { recursive: true });

const stem = basename(sourcePath, extname(sourcePath));
const port = await findFreePort();
const base = await readBase();
const url = `http://localhost:${port}${base}`;

/** 파일을 페이지로 넘긴다. 큰 파일이라 base64 대신 페이지가 직접 fetch 하게 둔다 */
const servedName = 'qa-transcribe-source' + extname(sourcePath);
const servedPath = join('public', servedName);
await writeFile(servedPath, await readFile(sourcePath));

const START = `(async () => {
	const { transcribeVideo, formatBytesProgress } = await import('${base}src/services/index.ts');
	const bytes = await (await fetch('${base}${servedName}')).arrayBuffer();
	const file = new File([bytes], ${JSON.stringify(basename(sourcePath))}, { type: 'video/mp4' });

	window.qaRunId = ${JSON.stringify(String(process.pid))};
	window.qaState = { stage: 'start', percent: 0, label: '', done: false, error: null, transcript: null };
	transcribeVideo(file, (progress) => {
		const percent = progress.kind === 'percent'
			? Math.round(progress.percent)
			: Math.round((progress.loadedBytes / progress.totalBytes) * 100);
		// 앱이 쓰는 표기를 그대로 부른다. 여기서 따로 계산하면 단위가 갈린다
		const label = progress.kind === 'bytes' ? formatBytesProgress(progress) : percent + '%';
		window.qaState = { ...window.qaState, stage: progress.stage, percent, label };
	}).then((transcript) => {
		window.qaState = { ...window.qaState, done: true, transcript };
	}).catch((cause) => {
		// 실패 코드만 남기면 왜 터졌는지가 사라진다. 워커가 함께 보낸 메시지를 살려 둔다
		const failure = cause && cause.failure ? cause.failure : null;
		// TranscriptionError 는 message 를 실패 코드로 만들고 진짜 내용을 cause 에 넣는다.
		// message 만 읽으면 "transcription failed: TRANSCRIBE" 만 남는다
		const detail = cause && cause.cause !== undefined && cause.cause !== null ? String(cause.cause) : null;
		const message = detail ?? (cause && cause.message ? cause.message : String(cause));
		const stack = cause && cause.stack ? String(cause.stack).slice(0, 400) : null;
		window.qaState = {
			...window.qaState,
			done: true,
			error: failure ? failure + ': ' + message : message,
			errorStack: stack
		};
	});
	return true;
})()`;

const depsMtimeAtStart = await newestViteDepsMtime();
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-transcribe-' });

try {
	await waitForUrl(url);
	const { send, sessionId } = await chrome.attach();
	await send('Runtime.enable', {}, sessionId);
	await send('Page.navigate', { url }, sessionId);
	await wait(2000);

	const evaluate = async (expression) => {
		const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
		if (out.result?.exceptionDetails) {
			throw new Error(out.result.exceptionDetails.exception?.description ?? '페이지에서 평가가 실패했다');
		}
		return out.result?.result?.value;
	};

	const adapter = await evaluate('(async () => !!(await navigator.gpu?.requestAdapter()))()');
	if (adapter !== true) {
		throw new Error('WebGPU 어댑터가 없다');
	}

	console.log(`파일: ${sourcePath}`);

	// 시작이 실제로 걸렸는지 본다. 여기를 확인하지 않으면 상태가 없는 채로 폴링만 돈다
	const started = await evaluate(START);
	if (started !== true) {
		throw new Error(`파이프라인을 시작하지 못했다: ${JSON.stringify(started)}`);
	}

	const startedAt = Date.now();
	let lastLabel = '';
	let lastChangeAt = Date.now();
	let state = null;

	while (true) {
		await wait(POLL_MS);
		state = await evaluate('window.qaState ?? null');

		// 페이지가 다시 불리면 진행 상태가 사라진다. 여기서 알아채지 않으면
		// 무슨 일이 일어났는지 모르는 채로 죽는다
		if (state === null) {
			const stillRunning = await evaluate(`window.qaRunId === ${JSON.stringify(String(process.pid))}`);
			if (stillRunning) {
				throw new Error('진행 상태가 사라졌다');
			}

			// 원인이 둘이라 단정하지 않는다. 의존성 재최적화면 한 번 더 돌리면 지나간다
			const reoptimized = (await newestViteDepsMtime()) > depsMtimeAtStart;
			throw new Error(
				reoptimized
					? 'vite 가 의존성을 다시 최적화해 페이지를 다시 불렀다. 저장소 파일 탓이 아니다. 한 번 더 돌리면 캐시가 채워져 지나간다'
					: '저장소 파일이 바뀌어 페이지를 다시 불렀다. 변환 중에는 저장소 파일을 고치지 않는다'
			);
		}

		const line = `${state.stage} ${state.label}`;
		if (line !== lastLabel) {
			const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
			console.log(`  [${minutes}분] ${line}`);
			lastLabel = line;
			lastChangeAt = Date.now();
		}

		if (state.done) {
			break;
		}

		// 진행이 멈춘 채로 오래 있으면 매달린 것이다. 끝없이 기다리지 않는다
		if (Date.now() - lastChangeAt > IDLE_LIMIT_MS) {
			throw new Error(`${IDLE_LIMIT_MS / 60000}분 동안 진행이 없다. 마지막 상태: ${line}`);
		}
	}

	if (state.error) {
		if (state.errorStack) {
			console.log(`스택: ${state.errorStack}`);
		}
		throw new Error(`변환 실패: ${state.error}`);
	}

	const written = await evaluate(`(async () => {
		const { buildTxt, buildSrt, buildVtt } = await import('${base}src/services/export.format.ts');
		const t = window.qaState.transcript;
		return {
			txt: buildTxt(t), srt: buildSrt(t), vtt: buildVtt(t),
			count: t.segments.length, seconds: t.durationSeconds,
			transcribeMs: t.transcribeMs ?? null, windowMsList: t.windowMsList ?? null,
			windowTokenCounts: t.windowTokenCounts ?? null, trimmedByWindow: t.trimmedByWindow ?? null, phraseRepeatsByWindow: t.phraseRepeatsByWindow ?? null, repeatedSegmentChars: t.repeatedSegmentChars ?? null,
			plan: t.plan ?? null
		};
	})()`);

	for (const format of ['txt', 'srt', 'vtt']) {
		const path = join(outDir, `${stem}.${format}`);
		await writeFile(path, written[format], 'utf8');
		console.log(`저장: ${path}`);
	}

	const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
	console.log(`\n문장 ${written.count}개, 음성 ${(written.seconds / 60).toFixed(1)}분, 전체 ${minutes}분`);

	if (written.transcribeMs) {
		const seconds = written.transcribeMs / 1000;
		console.log(`변환 단계 ${(seconds / 60).toFixed(1)}분, ${(written.seconds / seconds).toFixed(1)}배속`);
	}

	// 조용히 지우지 않는다. 줄인 것이 있으면 반드시 찍는다
	if (written.trimmedByWindow?.length) {
		const total = written.trimmedByWindow.reduce((a, b) => a + b, 0);
		if (total > 0) {
			const where = written.trimmedByWindow.map((n, i) => (n > 0 ? `창 ${i}에서 ${n}자` : null)).filter(Boolean);
			console.log(`병적 반복을 줄였다: 모두 ${total}자 (${where.join(', ')})`);
		} else {
			console.log('병적 반복 없음');
		}
	}

	// 자르지 않는 값이라 반드시 보여야 한다. 안 보이면 없는 것과 구분이 안 된다
	if (written.phraseRepeatsByWindow?.length) {
		const total = written.phraseRepeatsByWindow.reduce((a, b) => a + b, 0);
		const where = written.phraseRepeatsByWindow.map((n, i) => (n > 0 ? `창 ${i}:${n}자` : null)).filter(Boolean);
		console.log(`조각 되풀이(안 자름) 모두 ${total}자${where.length ? ` (${where.join(', ')})` : ''}`);
	}

	if (written.repeatedSegmentChars !== null && written.repeatedSegmentChars !== undefined) {
		console.log(`구간 경계를 넘는 되풀이(안 자름) ${written.repeatedSegmentChars}자`);
	}

	if (written.plan) {
		const {
			windowSeconds,
			windowCount,
			chunkCount,
			chunkCounts,
			skippedRanges,
			silenceGapCount,
			minSilenceSeconds,
			skippedSilenceSeconds
		} = written.plan;
		const skipped =
			minSilenceSeconds === null
				? '건너뛴 무음 없음'
				: `무음 ${minSilenceSeconds}초 기준으로 ${skippedSilenceSeconds}초 건너뜀`;
		console.log(`창 ${windowSeconds}초 ${windowCount}칸, 조각 ${chunkCount}개`);
		console.log(`무음 검출 ${silenceGapCount}구간, ${skipped}`);
		if (skippedRanges?.length) {
			const spans = skippedRanges.map((r) => `${r.startSeconds.toFixed(0)}-${r.endSeconds.toFixed(0)}`);
			console.log(`건너뛴 구간: ${spans.join(', ')}`);
		}

		// 창별 시간과 조각 수를 짝지어 둔다. 조각 수가 같은 창끼리 시간 차가 디코더 몫이다
		if (written.windowMsList?.length) {
			const pairs = written.windowMsList.map((ms, i) => `${chunkCounts?.[i] ?? '?'}조각 ${ms}ms`);
			console.log(`창별: ${pairs.join(', ')}`);
		}

		// 배치 이득 상한은 배치 크기가 아니라 합 나누기 최대다. 창마다 그 값을 낸다
		if (written.windowTokenCounts?.length) {
			console.log('\n창별 generate 호출과 토큰 수');
			let totalCalls = 0;
			const ratios = [];
			written.windowTokenCounts.forEach((counts, i) => {
				if (counts.length === 0) {
					return;
				}
				const sum = counts.reduce((a, b) => a + b, 0);
				const max = Math.max(...counts);
				totalCalls += counts.length;
				ratios.push(sum / max);
				console.log(
					`  창 ${i}: 조각 ${chunkCounts?.[i] ?? '?'}, 호출 ${counts.length}, 토큰 [${counts.join(', ')}], 합/최대 ${(sum / max).toFixed(2)}`
				);
			});
			const chunkTotal = (chunkCounts ?? []).reduce((a, b) => a + b, 0);
			console.log(
				`generate 호출 ${totalCalls}회, 조각 ${chunkTotal}개 -> 조각당 ${(totalCalls / chunkTotal).toFixed(2)}회`
			);
			if (ratios.length) {
				const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
				console.log(`창별 합/최대 평균 ${mean.toFixed(2)} (배치로 얻을 수 있는 상한)`);
			}
		}
	}
} finally {
	await chrome.close();
	server.kill();
	await writeFile(servedPath, '').catch(() => {});
	await import('node:fs/promises').then(({ rm }) => rm(servedPath, { force: true }));
}
