// 배포되는 산출물에 실제 mp4 와 mov 를 넣어 결과 화면까지 가는지 실제 Chrome 으로 확인한다.
// Playwright 가 함께 배포하는 Chromium 은 H.264 와 AAC 디코더가 빠져 있어 멀쩡한 파일도 실패로 보인다.
// 그래서 설치된 Chrome 을 DevTools 프로토콜로 띄운다.
//
// 사용법: pnpm build 뒤에 node scripts/qa/verify-end-to-end.mjs
// 미리보기 서버는 이 스크립트가 직접 띄우고 내린다. 개발 서버로는 배포물을 확인할 수 없다.

import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { readBase } from './base-url.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST_DIR = 'dist';
const FIXTURE_DIR = resolve('_workspace/fixtures');
const SERVED_FIXTURE = 'qa-fixture.mp4';
const TIMESTAMP_FIXTURE = 'korean-short.mp4';
const CONNECT_RETRY_LIMIT = 40;
const RETRY_DELAY_MS = 250;
const PREVIEW_RETRY_LIMIT = 60;
const STEP_TIMEOUT_MS = 420_000;
const POLL_MS = 1500;

const CASES = [
	{ file: 'speech-mono.mp4', expect: 'result', label: 'mp4 모노 음성' },
	{ file: 'korean-short.mp4', expect: 'result', label: 'mp4 한국어 음성' },
	{ file: 'speech-stereo.mov', expect: 'result', label: 'mov 스테레오 음성' },
	{ file: 'no-audio.mp4', expect: 'failure', label: '오디오 없는 mp4', message: '이 파일에서 음성을 찾지 못했습니다' }
];

// qa-inspector 가 같은 저장소에서 동시에 돌릴 수 있다. 포트를 고정하면 둘이 같은 서버를 보고
// 서로의 결과를 자기 것으로 읽는다. 매번 비어 있는 포트를 받아 쓴다.
function findFreePort() {
	return new Promise((res, rej) => {
		const probe = createServer();
		probe.on('error', rej);
		probe.listen(0, () => {
			const { port } = probe.address();
			probe.close(() => res(port));
		});
	});
}

const PREVIEW_PORT = await findFreePort();
const BASE = await readBase();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// "다른 파일 선택" 은 실패 안내 화면과 변환 확인 화면 양쪽에 있다. 그것만 보면 변환 시작이 먹지 않아
// 확인 화면에 머문 것도 실패로 찍혀 원인이 다른 두 상태가 같은 이름으로 보고된다.
// 확인 화면에만 있는 "변환 시작" 을 함께 봐서 가른다.
function readScreen(text) {
	// "새 영상 변환" 은 결과 화면에만 있다. 결과 화면이 문장 수를 적던 때에는 그 문구로 갈랐는데
	// 목록이 들어오면서 그 문구가 사라졌다
	if (text.includes('새 영상 변환')) {
		return 'result';
	}

	if (text.includes('변환 시작')) {
		return 'confirm';
	}

	if (text.includes('다른 파일 선택')) {
		return 'failure';
	}

	return 'progress';
}

async function findWorkerAsset() {
	const files = await readdir(join(DIST_DIR, 'assets'));
	const worker = files.find((name) => name.startsWith('transcribe.worker-') && name.endsWith('.js'));
	if (!worker) {
		throw new Error('빌드 산출물에서 워커 파일을 찾지 못했다. pnpm build 를 먼저 돌려라');
	}

	return worker;
}

async function waitForPreview() {
	for (let attempt = 0; attempt < PREVIEW_RETRY_LIMIT; attempt += 1) {
		try {
			const response = await fetch(`http://localhost:${PREVIEW_PORT}${BASE}`);
			if (response.ok) return;
		} catch {
			// 아직 뜨지 않았다
		}
		await wait(RETRY_DELAY_MS);
	}
	throw new Error('미리보기 서버가 뜨지 않았다');
}

async function waitForDebugger(profileDir) {
	for (let attempt = 0; attempt < CONNECT_RETRY_LIMIT; attempt += 1) {
		try {
			const [port] = (await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n');
			const response = await fetch(`http://127.0.0.1:${port.trim()}/json/version`);
			return await response.json();
		} catch {
			await wait(RETRY_DELAY_MS);
		}
	}
	throw new Error('Chrome 디버깅 포트에 붙지 못했다');
}

function createClient(socket) {
	const pending = new Map();
	let lastId = 0;
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		const settle = pending.get(message.id);
		if (settle) {
			pending.delete(message.id);
			settle(message);
		}
	});
	return (method, params = {}, sessionId) =>
		new Promise((res) => {
			lastId += 1;
			pending.set(lastId, res);
			socket.send(JSON.stringify({ id: lastId, method, params, sessionId }));
		});
}

// 화면의 목록은 시각을 mm:ss 까지만 적어 밀리초와 끝 시각이 보이지 않는다.
// 그 값들은 파이프라인이 내놓는 것이라 배포된 워커에 직접 물어 확인한다.
function buildTimestampProbe(workerAsset) {
	return `(async () => {
		let decoded = null;
		try {
			const bytes = await (await fetch('${BASE}${SERVED_FIXTURE}')).arrayBuffer();
			decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes);
		} catch (cause) {
			return { error: '디코딩 실패: ' + (cause && cause.message) };
		}
		const target = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
		const source = target.createBufferSource();
		source.buffer = decoded;
		source.connect(target.destination);
		source.start();
		const pcm = (await target.startRendering()).getChannelData(0);

		const worker = new Worker('${BASE}assets/${workerAsset}', { type: 'module' });
		const settled = new Promise((resolve, reject) => {
			worker.addEventListener('message', (event) => {
				if (event.data.type === 'transcribe-done') resolve(event.data.segments);
				if (event.data.type === 'failed') reject(new Error(event.data.failure + ': ' + event.data.message));
			});
			worker.addEventListener('error', (event) => reject(new Error(event.message)));
		});

		await new Promise((ready) => {
			const onMessage = (event) => {
				if (event.data.type === 'model-ready') {
					worker.removeEventListener('message', onMessage);
					ready();
				}
			};
			worker.addEventListener('message', onMessage);
			worker.postMessage({ type: 'load' });
		});

		worker.postMessage({ type: 'transcribe', pcm, sampleRate: 16000 }, [pcm.buffer]);
		const segments = await settled;
		worker.terminate();

		return {
			count: segments.length,
			allNumeric: segments.every((s) => Number.isFinite(s.startSeconds) && Number.isFinite(s.endSeconds)),
			endAfterStart: segments.every((s) => s.endSeconds >= s.startSeconds),
			ascending: segments.every((s, i) => i === 0 || s.startSeconds >= segments[i - 1].startSeconds),
			nonEmptyText: segments.every((s) => typeof s.text === 'string' && s.text.length > 0),
			sample: segments.slice(0, 2)
		};
	})()`;
}

const workerAsset = await findWorkerAsset();
await copyFile(join(FIXTURE_DIR, TIMESTAMP_FIXTURE), join(DIST_DIR, SERVED_FIXTURE));

const profileDir = await mkdtemp(join(tmpdir(), 'vidscript-e2e-'));
const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' });
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--enable-unsafe-webgpu'
	],
	{ stdio: 'ignore' }
);

const results = [];

try {
	await waitForPreview();
	const version = await waitForDebugger(profileDir);
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise((res, rej) => {
		socket.addEventListener('open', res, { once: true });
		socket.addEventListener('error', rej, { once: true });
	});

	const send = createClient(socket);
	const target = await send('Target.createTarget', { url: 'about:blank' });
	const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
	const sessionId = attached.result.sessionId;

	await send('Page.enable', {}, sessionId);
	await send('DOM.enable', {}, sessionId);
	await send('Runtime.enable', {}, sessionId);

	const evaluate = async (expression) => {
		const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
		if (out.result?.exceptionDetails) {
			return { error: out.result.exceptionDetails.exception?.description ?? '알 수 없는 오류' };
		}

		return out.result?.result?.value;
	};

	await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}${BASE}` }, sessionId);
	await wait(2000);

	const adapter = await evaluate('(async () => !!(await navigator.gpu?.requestAdapter()))()');
	console.log(`WebGPU 어댑터: ${adapter === true ? '확보' : JSON.stringify(adapter)}`);
	if (adapter !== true) {
		throw new Error('WebGPU 어댑터가 없어 종단 확인을 진행할 수 없다');
	}

	// 사례마다 OfflineAudioContext 가 둘씩 쌓이고 렌더러가 그것을 페이지 이동으로 놓아주지 않는다.
	// 넷을 돌린 뒤 디코딩하면 멀쩡한 파일도 EncodingError 로 떨어진다. 그래서 쌓이기 전에 먼저 잰다.
	const timestamps = await evaluate(buildTimestampProbe(workerAsset));

	for (const testCase of CASES) {
		await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}${BASE}` }, sessionId);
		await wait(1500);

		const handle = await send(
			'Runtime.evaluate',
			{ expression: "document.querySelector('input[type=file]')" },
			sessionId
		);
		const objectId = handle.result?.result?.objectId;
		if (!objectId) {
			results.push({ ...testCase, outcome: '파일 입력을 찾지 못함' });
			continue;
		}

		await send('DOM.setFileInputFiles', { objectId, files: [join(FIXTURE_DIR, testCase.file)] }, sessionId);
		await wait(2500);

		const started = await evaluate(
			"(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('변환 시작')); if (!b) return false; b.click(); return true; })()"
		);
		if (started !== true) {
			const shown = String(await evaluate('document.body.innerText'))
				.replace(/\s+/g, ' ')
				.slice(0, 160);
			results.push({ ...testCase, outcome: `변환 시작 버튼 없음. 화면: ${shown}` });
			continue;
		}

		const deadline = Date.now() + STEP_TIMEOUT_MS;
		let text = '';
		let screen = 'progress';
		while (Date.now() < deadline) {
			await wait(POLL_MS);
			text = String(await evaluate('document.body.innerText')).replace(/\s+/g, ' ');
			screen = readScreen(text);
			// 확인 화면이 남아 있는 것은 클릭이 아직 반영되지 않은 것일 수도 있어 끝까지 기다린다
			if (screen === 'result' || screen === 'failure') break;
		}

		results.push({
			...testCase,
			outcome:
				screen === 'confirm' ? '확인 화면에 머무름(변환 시작이 먹지 않음)' : screen === 'progress' ? 'timeout' : screen,
			segmentCount: Number(await evaluate("document.querySelectorAll('ul li').length")),
			messageOk: testCase.message ? text.includes(testCase.message) : true,
			text: text.slice(0, 140)
		});
	}

	console.log('\n화면 종단 결과');
	let allPassed = true;
	for (const row of results) {
		const passed =
			row.outcome === row.expect && row.messageOk !== false && (row.expect !== 'result' || row.segmentCount > 0);
		allPassed = allPassed && passed;
		console.log(`  [${passed ? '통과' : '실패'}] ${row.label} (${row.file})`);
		console.log(
			`         기대 ${row.expect} / 실제 ${row.outcome}${row.expect === 'result' ? `, 구간 ${row.segmentCount}개` : ''}`
		);
		if (row.message) {
			console.log(`         SPEC 문구 일치 ${row.messageOk ? '예' : '아니오'}`);
		}
		if (!passed) {
			console.log(`         화면: ${row.text ?? ''}`);
		}
	}

	const timestampsOk =
		timestamps &&
		!timestamps.error &&
		timestamps.count > 0 &&
		timestamps.allNumeric &&
		timestamps.endAfterStart &&
		timestamps.ascending &&
		timestamps.nonEmptyText;

	console.log('\n구간 시각 확인 (배포된 워커에 mp4 해독 PCM 을 직접 넘김)');
	console.log(`  [${timestampsOk ? '통과' : '실패'}] ${JSON.stringify(timestamps)}`);

	console.log(`\n판정: ${allPassed && timestampsOk ? '통과' : '실패'}`);
} finally {
	chrome.kill();
	preview.kill();
	await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
	await rm(join(DIST_DIR, SERVED_FIXTURE), { force: true });
}
