// 오디오 추출 결과를 실제 Chrome 에서 재서 숫자로 돌려준다.
// OfflineAudioContext 와 AAC 디코더가 필요해 브라우저 없이는 확인할 수 없고,
// Playwright 의 기본 Chromium 은 AAC 코덱이 없어 정상 파일도 실패로 보인다.
// 그래서 설치된 Chrome 을 DevTools 프로토콜로 직접 띄운다.
//
// 사용법: node scripts/qa/measure-audio.mjs <검증 파일 이름> [mime]
// 사전 조건: pnpm dev 로 개발 서버가 3600 포트에 떠 있어야 한다.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEV_PAGE = 'http://localhost:3600/dev.html';
const FIXTURE_BASE = '/_workspace/fixtures/';
const LOAD_WAIT_MS = 2500;
const CONNECT_RETRY_LIMIT = 40;
const CONNECT_RETRY_DELAY_MS = 250;
const PROBE_ATTEMPT_LIMIT = 3;
const PROBE_RETRY_DELAY_MS = 1500;

const fixtureName = process.argv[2];
const mimeType = process.argv[3] ?? 'video/quicktime';

if (!fixtureName) {
	console.error('검증 파일 이름을 넘겨라. 예: node scripts/qa/measure-audio.mjs stereo-lr.mov');
	process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 포트를 고정하면 앞선 실행이 아직 물고 있을 때 죽어 가는 인스턴스에 붙는다.
// 그러면 미디어 스택이 내려간 상태라 정상 파일도 DECODE 로 떨어진다.
// Chrome 이 직접 고른 포트를 프로필의 DevToolsActivePort 에서 읽어 이 충돌을 없앤다.
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

function createClient(socket) {
	const pending = new Map();
	let lastId = 0;

	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
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

// 페이지 안에서 도는 코드다. 추출 결과의 RMS 를 좌채널과 우채널, 좌우 평균의 RMS 와 나란히 돌려준다.
// 평균 다운믹스가 맞으면 측정값이 평균 RMS 에 붙고, 좌채널만 쓰면 좌채널 RMS 에 붙는다.
function buildProbeExpression(name, mime) {
	return `(async () => {
		const { extractAudio } = await import('/src/pipeline/audio.extractor.ts');
		const rms = (samples) => {
			let total = 0;
			for (let index = 0; index < samples.length; index += 1) {
				total += samples[index] * samples[index];
			}
			return Math.sqrt(total / samples.length);
		};

		const url = ${JSON.stringify(FIXTURE_BASE)} + ${JSON.stringify(name)};
		const response = await fetch(url);
		const bytes = await response.arrayBuffer();

		// 개발 서버가 검증 파일 대신 index.html 을 돌려주는 일이 있다. 그대로 디코딩하면
		// 코드 결함처럼 DECODE 로 보이므로, mp4 와 mov 의 ftyp 상자를 확인해 여기서 갈라낸다.
		const signature = String.fromCharCode(...new Uint8Array(bytes.slice(4, 8)));
		if (!response.ok || signature !== 'ftyp') {
			throw new Error(
				'검증 파일이 아니라 다른 응답을 받았다. 개발 서버를 확인해라.' +
					' status=' + response.status + ' bytes=' + bytes.byteLength + ' signature=' + JSON.stringify(signature)
			);
		}

		const file = new File([bytes], ${JSON.stringify(name)}, { type: ${JSON.stringify(mime)} });
		let extracted;
		try {
			extracted = await extractAudio(file);
		} catch (failure) {
			throw new Error(
				'추출 실패 code=' + failure.failure + ' cause=' + (failure.cause ? failure.cause.name + ': ' + failure.cause.message : '없음') +
					' fetchStatus=' + response.status + ' fetchBytes=' + bytes.byteLength + ' fileSize=' + file.size
			);
		}

		const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await (await fetch(url)).arrayBuffer());
		const left = decoded.getChannelData(0);
		const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
		const average = new Float32Array(left.length);
		for (let index = 0; index < left.length; index += 1) {
			average[index] = (left[index] + right[index]) / 2;
		}

		const measured = rms(extracted.pcm);
		const averageRms = rms(average);
		const leftRms = rms(left);

		// 좌우가 같은 입력은 평균과 좌채널의 기대값이 같아서 어느 쪽으로 구현했든 같은 숫자가 나온다.
		// 채널이 2개라도 이런 파일로는 다운믹스를 확인하지 못한다.
		const discriminable = Math.abs(averageRms - leftRms) > 1e-6;

		return {
			decodedChannels: decoded.numberOfChannels,
			decodedRate: decoded.sampleRate,
			decodedFrames: decoded.length,
			pcmLength: extracted.pcm.length,
			sampleRate: extracted.sampleRate,
			durationSeconds: extracted.durationSeconds,
			measuredRms: measured,
			leftRms,
			rightRms: rms(right),
			averageRms,
			distanceToAverage: Math.abs(measured - averageRms),
			distanceToLeft: Math.abs(measured - leftRms),
			discriminable,
			verdict: !discriminable
				? '판별 불가. 좌우가 같은 입력이라 평균과 좌채널의 기대값이 겹친다'
				: Math.abs(measured - averageRms) < Math.abs(measured - leftRms)
					? '평균 다운믹스'
					: '좌채널만'
		};
	})()`;
}

const profileDir = await mkdtemp(join(tmpdir(), 'vidscript-qa-'));
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--autoplay-policy=no-user-gesture-required'
	],
	{ stdio: 'ignore' }
);

try {
	const version = await waitForDebugger(profileDir);
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', reject, { once: true });
	});

	const send = createClient(socket);
	const target = await send('Target.createTarget', { url: 'about:blank' });
	const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
	const sessionId = attached.result.sessionId;

	await send('Page.enable', {}, sessionId);
	await send('Page.navigate', { url: DEV_PAGE }, sessionId);
	await wait(LOAD_WAIT_MS);

	// 머신이 바쁠 때 오디오 디코더가 늦게 준비돼 첫 시도가 DECODE 로 떨어진다.
	// 코드 결함과 구분하려고 같은 시도를 몇 번 반복해 본다. 끝까지 실패하면 그때 실패로 본다.
	const expression = buildProbeExpression(fixtureName, mimeType);
	let evaluated;
	for (let attempt = 1; attempt <= PROBE_ATTEMPT_LIMIT; attempt += 1) {
		evaluated = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
		if (!evaluated.result?.exceptionDetails) {
			break;
		}

		if (attempt < PROBE_ATTEMPT_LIMIT) {
			console.error(`${attempt}번째 시도가 실패했다. 디코더 준비를 기다려 다시 시도한다`);
			await wait(PROBE_RETRY_DELAY_MS);
		}
	}

	const thrown = evaluated.result?.exceptionDetails;
	if (thrown) {
		console.error('페이지에서 오류가 났다:', thrown.exception?.description ?? JSON.stringify(thrown, null, 2));
		process.exitCode = 1;
	} else {
		console.log(JSON.stringify({ fixture: fixtureName, ...evaluated.result.result.value }, null, 2));
	}

	socket.close();
} finally {
	chrome.kill();
	// Chrome 이 프로필을 놓기 전에 지우면 ENOTEMPTY 가 난다. 종료를 기다리고 재시도까지 준다.
	await new Promise((resolve) => {
		if (chrome.exitCode !== null) {
			resolve();
			return;
		}
		chrome.once('exit', resolve);
	});
	await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
