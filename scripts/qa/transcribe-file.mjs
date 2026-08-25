// 실제 파일을 앱의 파이프라인 그대로 돌려 결과를 파일로 받는다.
// 화면을 거치지 않을 뿐 코드는 앱이 쓰는 것과 같다. 1시간짜리 실물로 확인하는 자리이면서
// 결과물을 실제로 쓰는 자리이기도 하다.
//
// 사용법: node scripts/qa/transcribe-file.mjs <영상> [출력 폴더]
//
// 모델 563MB 를 처음 한 번 내려받고 변환에 영상 길이만큼 걸릴 수 있다.

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { readBase } from './base-url.mjs';
import { findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

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
	const { transcribeVideo } = await import('${base}src/services/index.ts');
	const bytes = await (await fetch('${base}${servedName}')).arrayBuffer();
	const file = new File([bytes], ${JSON.stringify(basename(sourcePath))}, { type: 'video/mp4' });

	window.qaRunId = ${JSON.stringify(String(process.pid))};
	window.qaState = { stage: 'start', percent: 0, label: '', done: false, error: null, transcript: null };
	transcribeVideo(file, (progress) => {
		const percent = progress.kind === 'percent'
			? Math.round(progress.percent)
			: Math.round((progress.loadedBytes / progress.totalBytes) * 100);
		const label = progress.kind === 'bytes'
			? Math.round(progress.loadedBytes / 1048576) + 'MB / ' + Math.round(progress.totalBytes / 1048576) + 'MB'
			: percent + '%';
		window.qaState = { ...window.qaState, stage: progress.stage, percent, label };
	}).then((transcript) => {
		window.qaState = { ...window.qaState, done: true, transcript };
	}).catch((cause) => {
		window.qaState = { ...window.qaState, done: true, error: String(cause && cause.failure ? cause.failure : cause) };
	});
	return true;
})()`;

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

		// 개발 서버가 파일 변경을 보면 페이지를 다시 부르고 진행 상태가 사라진다.
		// 여기서 알아채지 않으면 무슨 일이 일어났는지 모르는 채로 죽는다
		if (state === null) {
			const stillRunning = await evaluate(`window.qaRunId === ${JSON.stringify(String(process.pid))}`);
			throw new Error(
				stillRunning ? '진행 상태가 사라졌다' : '페이지가 다시 불렸다. 변환 중에는 저장소 파일을 고치지 않는다'
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
		throw new Error(`변환 실패: ${state.error}`);
	}

	const written = await evaluate(`(async () => {
		const { buildTxt, buildSrt, buildVtt } = await import('${base}src/services/export.format.ts');
		const t = window.qaState.transcript;
		return { txt: buildTxt(t), srt: buildSrt(t), vtt: buildVtt(t), count: t.segments.length, seconds: t.durationSeconds };
	})()`);

	for (const format of ['txt', 'srt', 'vtt']) {
		const path = join(outDir, `${stem}.${format}`);
		await writeFile(path, written[format], 'utf8');
		console.log(`저장: ${path}`);
	}

	const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
	console.log(`\n문장 ${written.count}개, 음성 ${(written.seconds / 60).toFixed(1)}분, 변환 ${minutes}분`);
} finally {
	await chrome.close();
	server.kill();
	await writeFile(servedPath, '').catch(() => {});
	await import('node:fs/promises').then(({ rm }) => rm(servedPath, { force: true }));
}
