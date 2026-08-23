// 설치된 Chrome 을 DevTools 프로토콜로 띄우고 붙는 공통 골격.
// Playwright 가 함께 배포하는 Chromium 은 H.264 와 AAC 디코더가 빠져 있어 멀쩡한 파일도 실패로 보인다.
// 그래서 검증 스크립트는 모두 설치된 Chrome 을 직접 띄운다.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const COMMON_FLAGS = ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check'];

/** 합성 클릭은 사용자 제스처가 아니다. 이 플래그가 없으면 play() 가 막혀 재생 중 판정을 볼 수 없다 */
export const AUTOPLAY_FLAG = '--autoplay-policy=no-user-gesture-required';
/** 워커가 webgpu 장치로 세션을 만든다. 헤드리스에서는 이 플래그가 있어야 어댑터가 잡힌다 */
export const WEBGPU_FLAG = '--enable-unsafe-webgpu';

const DEBUGGER_RETRY_LIMIT = 40;
const SERVER_RETRY_LIMIT = 80;
const RETRY_DELAY_MS = 250;
const PROFILE_REMOVE = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// qa-inspector 가 같은 저장소에서 동시에 돌릴 수 있다. 포트를 고정하면 둘이 같은 서버를 보고
// 서로의 결과를 자기 것으로 읽는다. 매번 비어 있는 포트를 받아 쓴다.
export function findFreePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

/** 그 주소가 200 을 돌려줄 때까지 기다린다. 끝내 뜨지 않으면 던진다 */
export async function waitForUrl(url) {
	for (let attempt = 0; attempt < SERVER_RETRY_LIMIT; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// 아직 뜨지 않았다
		}

		await wait(RETRY_DELAY_MS);
	}

	throw new Error(`서버가 뜨지 않았다: ${url}`);
}

/** 빌드 산출물에서 전사 워커 파일 이름을 찾는다. 없으면 던진다 */
export async function findWorkerAsset(distDir) {
	const files = await readdir(join(distDir, 'assets'));
	const worker = files.find((name) => name.startsWith('transcribe.worker-') && name.endsWith('.js'));
	if (!worker) {
		throw new Error('빌드 산출물에서 워커 파일을 찾지 못했다. pnpm build 를 먼저 돌려라');
	}

	return worker;
}

// 포트를 고정하면 앞선 실행이 아직 물고 있을 때 죽어 가는 인스턴스에 붙는다.
// 그러면 미디어 스택이 내려간 상태라 정상 파일도 DECODE 로 떨어진다.
// Chrome 이 직접 고른 포트를 프로필의 DevToolsActivePort 에서 읽어 이 충돌을 없앤다.
async function waitForDebugger(profileDir) {
	for (let attempt = 0; attempt < DEBUGGER_RETRY_LIMIT; attempt += 1) {
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

function createClient(socket, onEvent) {
	const pending = new Map();
	let lastId = 0;

	const send = (method, params = {}, sessionId) => {
		lastId += 1;
		const id = lastId;

		return new Promise((resolve) => {
			pending.set(id, resolve);
			socket.send(JSON.stringify({ id, method, params, sessionId }));
		});
	};

	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.method) {
			onEvent?.(message, send);
			return;
		}

		const settle = pending.get(message.id);
		if (settle) {
			pending.delete(message.id);
			settle(message);
		}
	});

	return send;
}

/**
 * Chrome 을 띄우고 조종 손잡이를 돌려준다. 프로세스만 먼저 띄우므로 미리보기 서버를
 * 함께 올리는 스크립트는 서버를 기다리는 동안 Chrome 이 같이 준비된다.
 *
 * attach 는 디버깅 포트에 붙어 빈 대상을 하나 만들고 `{ send, sessionId }` 를 돌려준다.
 * onEvent 는 응답이 아닌 알림을 받는다. 두 번째 인자로 send 가 와서 알림 안에서 다시 부를 수 있다.
 */
export async function launchChrome({ profilePrefix, flags = [] }) {
	const profileDir = await mkdtemp(join(tmpdir(), profilePrefix));
	const chrome = spawn(CHROME, [...COMMON_FLAGS, `--user-data-dir=${profileDir}`, ...flags], { stdio: 'ignore' });
	let socket = null;

	const attach = async (onEvent) => {
		const version = await waitForDebugger(profileDir);
		socket = new WebSocket(version.webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			socket.addEventListener('open', resolve, { once: true });
			socket.addEventListener('error', reject, { once: true });
		});

		const send = createClient(socket, onEvent);
		const target = await send('Target.createTarget', { url: 'about:blank' });
		const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });

		return { send, sessionId: attached.result.sessionId };
	};

	// Chrome 이 프로필을 놓기 전에 지우면 ENOTEMPTY 가 난다. 종료를 기다리고 재시도까지 준다
	const close = async () => {
		socket?.close();
		chrome.kill();
		await new Promise((resolve) => {
			if (chrome.exitCode !== null) {
				resolve();
				return;
			}

			chrome.once('exit', resolve);
		});
		await rm(profileDir, PROFILE_REMOVE).catch(() => {});
	};

	return { attach, close };
}
