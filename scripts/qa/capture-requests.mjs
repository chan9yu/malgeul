// 프로덕션 빌드가 실제로 어느 호스트에 요청하는지 실제 Chrome 에서 잡아 본다.
// 개발 서버는 node_modules 를 그대로 서브해서 이 문제가 보이지 않는다. 빌드 산출물로만 확인된다.
// 정적 grep 으로는 갈음할 수 없다. 라이브러리 안에 죽은 기본값 문자열이 남아 있기 때문이다.
//
// 사용법: pnpm build 뒤에 node scripts/qa/capture-requests.mjs
// 미리보기 서버는 이 스크립트가 직접 띄우고 내린다.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST_DIR = 'dist';
const HARNESS_NAME = 'qa-harness.html';
const CONNECT_RETRY_LIMIT = 40;
const CONNECT_RETRY_DELAY_MS = 250;
const PREVIEW_RETRY_LIMIT = 60;
const CAPTURE_LIMIT_MS = 300_000;
const POLL_MS = 2000;
const ALLOWED_EXTERNAL_HOSTS = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs-us-1.hf.co', 'us.aws.cdn.hf.co'];

import { createServer } from 'node:net';

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findWorkerAsset() {
	const files = await readdir(join(DIST_DIR, 'assets'));
	const worker = files.find((name) => name.startsWith('transcribe.worker-') && name.endsWith('.js'));
	if (!worker) {
		throw new Error('빌드 산출물에서 워커 파일을 찾지 못했다. pnpm build 를 먼저 돌려라');
	}

	return worker;
}

// 워커를 공개 메시지 규약대로 직접 깨워 모델 로드를 시작시킨다.
// 모델을 다 받을 필요는 없다. 세션을 만드는 순간 onnxruntime 이 wasm 을 가져가므로 그 요청만 보면 된다.
async function writeHarness(workerAsset) {
	const html = `<!doctype html>
<html lang="ko">
	<head><meta charset="UTF-8" /><title>요청 수집</title></head>
	<body>
		<p id="log">시작</p>
		<script type="module">
			const worker = new Worker('/assets/${workerAsset}', { type: 'module' });
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

async function waitForPreview() {
	for (let attempt = 0; attempt < PREVIEW_RETRY_LIMIT; attempt += 1) {
		try {
			const response = await fetch(`http://localhost:${PREVIEW_PORT}/${HARNESS_NAME}`);
			if (response.ok) {
				return;
			}
		} catch {
			// 아직 뜨지 않았다
		}
		await wait(CONNECT_RETRY_DELAY_MS);
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
			await wait(CONNECT_RETRY_DELAY_MS);
		}
	}

	throw new Error('Chrome 디버깅 포트에 붙지 못했다');
}

function createClient(socket, onEvent) {
	const pending = new Map();
	let lastId = 0;

	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.method) {
			onEvent(message);
			return;
		}

		const resolve = pending.get(message.id);
		if (resolve) {
			pending.delete(message.id);
			resolve(message);
		}
	});

	return (method, params = {}, sessionId) => {
		lastId += 1;
		const id = lastId;

		return new Promise((resolve) => {
			pending.set(id, resolve);
			socket.send(JSON.stringify({ id, method, params, sessionId }));
		});
	};
}

const workerAsset = await findWorkerAsset();
await writeHarness(workerAsset);

const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { stdio: 'ignore' });
const profileDir = await mkdtemp(join(tmpdir(), 'vidscript-net-'));
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check'
	],
	{ stdio: 'ignore' }
);

const requests = [];

try {
	await waitForPreview();
	const version = await waitForDebugger(profileDir);
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});

	// 워커는 페이지와 다른 대상이라 페이지 세션의 Network 로는 워커의 요청이 잡히지 않는다.
	// 새 대상이 붙을 때마다 그 세션에서 Network 를 따로 켜야 한다.
	let send;
	const attachedSessions = [];
	send = createClient(socket, (message) => {
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
	});

	const target = await send('Target.createTarget', { url: 'about:blank' });
	const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
	const sessionId = attached.result.sessionId;

	await send('Network.enable', {}, sessionId);
	await send('Page.enable', {}, sessionId);
	await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);
	await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/${HARNESS_NAME}` }, sessionId);

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
	console.log(jsdelivr.length === 0 && disallowed.length === 0 ? '\n판정: 통과' : '\n판정: 실패');
} finally {
	chrome.kill();
	preview.kill();
	await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
	await rm(join(DIST_DIR, HARNESS_NAME), { force: true });
}
