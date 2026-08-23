// 프로덕션 빌드가 실제로 어느 호스트에 요청하는지 실제 Chrome 에서 잡아 본다.
// 개발 서버는 node_modules 를 그대로 서브해서 이 문제가 보이지 않는다. 빌드 산출물로만 확인된다.
// 정적 grep 으로는 갈음할 수 없다. 라이브러리 안에 죽은 기본값 문자열이 남아 있기 때문이다.
//
// 사용법: pnpm build 뒤에 node scripts/qa/capture-requests.mjs
// 미리보기 서버는 이 스크립트가 직접 띄우고 내린다.

import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readBase } from './base-url.mjs';
import { findFreePort, findWorkerAsset, launchChrome, wait, waitForUrl } from './chrome.mjs';

const DIST_DIR = 'dist';
const HARNESS_NAME = 'qa-harness.html';
const CAPTURE_LIMIT_MS = 300_000;
const POLL_MS = 2000;
// qa-gates 스킬의 허용 목록과 같아야 한다. 추측으로 넓히면 hf 가 다른 CDN 으로 옮겼을 때 조용히 통과한다
const ALLOWED_EXTERNAL_HOSTS = ['huggingface.co', 'us.aws.cdn.hf.co'];

const PREVIEW_PORT = await findFreePort();
const BASE = await readBase();
const HARNESS_URL = `http://localhost:${PREVIEW_PORT}${BASE}${HARNESS_NAME}`;

// 워커를 공개 메시지 규약대로 직접 깨워 모델 로드를 시작시킨다.
// 모델을 다 받을 필요는 없다. 세션을 만드는 순간 onnxruntime 이 wasm 을 가져가므로 그 요청만 보면 된다.
async function writeHarness(workerAsset) {
	const html = `<!doctype html>
<html lang="ko">
	<head><meta charset="UTF-8" /><title>요청 수집</title></head>
	<body>
		<p id="log">시작</p>
		<script type="module">
			const worker = new Worker('${BASE}assets/${workerAsset}', { type: 'module' });
			worker.addEventListener('message', (event) => {
				document.querySelector('#log').textContent = JSON.stringify(event.data).slice(0, 200);
				if (event.data.type === 'model-ready' || event.data.type === 'failed') {
					window.__done = event.data.type;
				}
			});
			worker.addEventListener('error', (event) => {
				document.querySelector('#log').textContent = '워커 오류 ' + event.message;
			});
			worker.postMessage({ type: 'load' });
		</script>
	</body>
</html>
`;
	await writeFile(join(DIST_DIR, HARNESS_NAME), html);
}

const workerAsset = await findWorkerAsset(DIST_DIR);
await writeHarness(workerAsset);

const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-net-' });

const requests = [];
const attachedSessions = [];

try {
	await waitForUrl(HARNESS_URL);

	// 워커는 페이지와 다른 대상이라 페이지 세션의 Network 로는 워커의 요청이 잡히지 않는다.
	// 새 대상이 붙을 때마다 그 세션에서 Network 를 따로 켜야 한다.
	const onEvent = (message, send) => {
		if (message.method === 'Network.requestWillBeSent') {
			requests.push(message.params.request.url);
			return;
		}

		if (message.method === 'Target.attachedToTarget') {
			const child = message.params.sessionId;
			attachedSessions.push(message.params.targetInfo.type);
			void send('Network.enable', {}, child);
			void send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, child);
			void send('Runtime.runIfWaitingForDebugger', {}, child);
		}
	};

	const { send, sessionId } = await chrome.attach(onEvent);

	await send('Network.enable', {}, sessionId);
	await send('Page.enable', {}, sessionId);
	await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
	await send('Page.navigate', { url: HARNESS_URL }, sessionId);

	const deadline = Date.now() + CAPTURE_LIMIT_MS;
	let done = null;
	while (!done && Date.now() < deadline) {
		await wait(POLL_MS);
		const probe = await send(
			'Runtime.evaluate',
			{ expression: 'window.__done ?? null', returnByValue: true },
			sessionId
		);
		done = probe.result?.result?.value ?? null;
	}
	console.log(`\n워커 종료 상태: ${done ?? '시간 안에 끝나지 않음'}`);

	const logged = await send(
		'Runtime.evaluate',
		{ expression: "document.querySelector('#log').textContent", returnByValue: true },
		sessionId
	);
	console.log(`\n하네스 마지막 상태: ${logged.result?.result?.value ?? '읽지 못함'}`);
	console.log(`붙은 대상: ${attachedSessions.join(', ') || '없음'}`);

	const hosts = new Map();
	for (const url of requests) {
		if (!url.startsWith('http')) {
			continue;
		}
		const { host } = new URL(url);
		hosts.set(host, (hosts.get(host) ?? 0) + 1);
	}

	const selfHost = `localhost:${PREVIEW_PORT}`;
	console.log(`\n요청 ${requests.length}건, 호스트별 집계`);
	for (const [host, count] of [...hosts].sort((a, b) => b[1] - a[1])) {
		const mark = host === selfHost ? '같은 출처' : ALLOWED_EXTERNAL_HOSTS.includes(host) ? '허용된 외부' : '허용 안 됨';
		console.log(`  ${String(count).padStart(4)}건  ${host}  [${mark}]`);
	}

	const jsdelivr = requests.filter((url) => url.includes('jsdelivr'));
	const wasmRequests = requests.filter((url) => url.endsWith('.wasm'));
	const disallowed = [...hosts.keys()].filter((host) => host !== selfHost && !ALLOWED_EXTERNAL_HOSTS.includes(host));

	console.log(`\njsdelivr 요청: ${jsdelivr.length}건`);
	console.log(`wasm 요청: ${wasmRequests.length}건`);
	for (const url of wasmRequests) {
		console.log(`  ${url}`);
	}
	const externalPaths = requests
		.filter((url) => url.startsWith('http') && new URL(url).host !== selfHost)
		.map((url) => new URL(url).pathname.split('/').slice(-1)[0]);
	console.log(`외부로 나간 파일 이름: ${[...new Set(externalPaths)].join(', ')}`);
	console.log(`\n허용 안 된 호스트: ${disallowed.length ? disallowed.join(', ') : '없음'}`);

	// 워커가 아무것도 못 받으면 jsdelivr 도 0건이고 허용 안 된 호스트도 없다. 둘만 보면 그 상태가 통과로 찍힌다.
	// 실제로 모델을 받아 WebGPU 세션까지 만든 것을 확인해야 이 측정이 무언가를 본 것이다.
	const reachedReady = done === 'model-ready';
	const loadedWasm = wasmRequests.length > 0;
	const passed = reachedReady && loadedWasm && jsdelivr.length === 0 && disallowed.length === 0;

	if (!reachedReady) {
		console.log(`\n측정이 성립하지 않았다: 워커가 model-ready 에 닿지 못했다 (${done ?? '시간 안에 끝나지 않음'})`);
	}
	if (!loadedWasm) {
		console.log('측정이 성립하지 않았다: wasm 요청이 0건이다');
	}

	console.log(passed ? '\n판정: 통과' : '\n판정: 실패');
} finally {
	await chrome.close();
	preview.kill();
	await rm(join(DIST_DIR, HARNESS_NAME), { force: true });
}
