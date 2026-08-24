// 코드가 받아 주는 최대 크기의 파일을 브라우저가 실제로 읽는지 확인한다.
// 크기 검사는 {name, size} 만 보는 순수 함수라 이 사실을 알 수 없다. 실제 Blob 을 읽어야 드러난다.
//
// 사용법: pnpm build 뒤에 node scripts/qa/verify-size-limit.mjs

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { readBase } from './base-url.mjs';
import { createChecklist } from './checklist.mjs';
import { createEvaluate, findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

const VALIDATION_PATH = 'src/utils/upload.validation.ts';

async function readMaxBytes() {
	const source = await readFile(VALIDATION_PATH, 'utf8');
	const found = /const MAX_FILE_BYTES = ([\d_]+);/.exec(source);

	if (!found) {
		throw new Error(`${VALIDATION_PATH} 에서 MAX_FILE_BYTES 를 찾지 못했다`);
	}

	return Number(found[1].replaceAll('_', ''));
}

function buildProbe(bytes) {
	return `(async () => {
		// 같은 조각을 여러 번 넣어 큰 Blob 을 만든다. Chrome 은 큰 Blob 을 디스크로 내린다
		const CHUNK = 64 * 1024 * 1024;
		const chunk = new Uint8Array(CHUNK);
		const parts = [];
		let left = ${bytes};
		while (left > 0) {
			parts.push(chunk.subarray(0, Math.min(CHUNK, left)));
			left -= CHUNK;
		}

		let blob;
		try {
			blob = new Blob(parts);
		} catch (cause) {
			return { phase: 'Blob 생성', error: String(cause && cause.name) };
		}

		if (blob.size !== ${bytes}) {
			return { phase: 'Blob 크기', error: 'Blob 이 ' + blob.size + ' 바이트로 만들어졌다' };
		}

		try {
			const buffer = await blob.arrayBuffer();
			return { phase: 'arrayBuffer', read: buffer.byteLength };
		} catch (cause) {
			return { phase: 'arrayBuffer', error: String(cause && cause.name) };
		}
	})()`;
}

const maxBytes = await readMaxBytes();
const port = await findFreePort();
const base = await readBase();
const url = `http://localhost:${port}${base}`;

const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-size-' });
const { check, report } = createChecklist();

try {
	await waitForUrl(url);
	const { send, sessionId } = await chrome.attach();
	await send('Runtime.enable', {}, sessionId);
	await send('Page.navigate', { url }, sessionId);
	await wait(1500);

	const evaluate = createEvaluate(send, sessionId);

	console.log(`코드가 받아 주는 최대 크기: ${maxBytes.toLocaleString()} 바이트`);

	const atLimit = await evaluate(buildProbe(maxBytes));
	check(
		'받아 주는 최대 크기',
		'브라우저가 끝까지 읽는다',
		atLimit?.read === maxBytes,
		atLimit?.error ? `${atLimit.phase}: ${atLimit.error}` : `${atLimit?.read ?? '없음'} 바이트`
	);

	// 위 검사만 두면 읽기가 늘 성공하는 환경에서 벽이 사라져도 알 수 없다.
	// 벽이 그대로 있는지 함께 본다
	const overWall = await evaluate(buildProbe(2 ** 31));
	check(
		'2GiB 벽',
		'그 자리에 그대로 있다',
		overWall?.error === 'NotReadableError',
		overWall?.error ? `${overWall.phase}: ${overWall.error}` : `${overWall?.read ?? '없음'} 바이트를 읽었다`
	);

	process.exitCode = report() > 0 ? 1 : 0;
} finally {
	await chrome.close();
	preview.kill();
}
