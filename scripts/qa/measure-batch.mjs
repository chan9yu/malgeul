// 디코더 배치 폭에 따라 단계당 비용이 얼마나 오르는지 잰다.
// 배치 이득의 상한(합 나누기 최대)은 단계 수의 비일 뿐이라, 시간의 비로 바꾸려면 이 값이 필요하다.
//
// 조각 여러 개를 배치로 넣는 길은 라이브러리가 막아 둔다. 인코더 배치가 N 인데 디코더가 1 이면
// 예외를 던지고, 디코더에 배치 텐서를 주는 길도 prepareTensorForDecode 가 batch 1 만 받는다.
// 지원되는 것은 인코더 하나를 디코더 N 으로 늘리는 경로뿐이다. 그쪽으로 잰다.
// 모든 원소가 같은 시작 토큰이라 같은 단계에 끝나므로 단계 수가 폭과 무관하게 고정된다.
//
// 폭마다 토큰 수를 바꿔 직선을 얻는다. 기울기가 단계당 비용이고 절편이 인코더 비용이다.
// 토큰 20, 60, 100 에서 60 이 정확히 중점이라 직선 가정 자체도 함께 확인한다.
//
// 사용법: node scripts/qa/measure-batch.mjs [영상]

import { spawn } from 'node:child_process';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { readBase } from './base-url.mjs';
import { createEvaluate, findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

const WIDTHS = [1, 2, 4, 8];
const TOKEN_COUNTS = [20, 60, 100];
const REPEATS = 5;
const POLL_MS = 3_000;
const IDLE_LIMIT_MS = 900_000;

const source = resolve(process.argv[2] ?? '_workspace/fixtures/korean-short.mp4');
await access(source);

const port = await findFreePort();
const base = await readBase();
const url = `http://localhost:${port}${base}`;

const servedName = 'qa-transcribe-source' + extname(source);
const servedPath = join('public', servedName);
await writeFile(servedPath, await readFile(source));

const START = `(async () => {
	const { pipeline } = await import('${base}node_modules/@huggingface/transformers/dist/transformers.web.js');
	const cfg = await import('${base}src/services/model.config.ts');
	const { extractAudio } = await import('${base}src/services/audio.extractor.ts');

	window.qaBatch = { done: false, error: null, rows: null, note: '' };
	(async () => {
		const transcriber = await pipeline('automatic-speech-recognition', cfg.MODEL_ID, {
			device: cfg.MODEL_DEVICE,
			dtype: cfg.MODEL_DTYPE
		});

		const bytes = await (await fetch('${base}${servedName}')).arrayBuffer();
		const file = new File([bytes], 'x.mp4', { type: 'video/mp4' });
		const audio = await extractAudio(file);
		const need = cfg.WHISPER_CHUNK_SECONDS * audio.sampleRate;
		if (audio.pcm.length < need) {
			throw new Error('audio shorter than one chunk');
		}
		const one = audio.pcm.subarray(0, need);
		const feat = (await transcriber.processor(one)).input_features;

		// 토큰마다 세어 실제 단계 수를 확인한다. 설정값과 다르면 EOS 가 먼저 끊은 것이다
		class Counter {
			constructor() { this.steps = -1; }
			put() { this.steps += 1; }
			end() {}
		}

		// 조각을 여러 개 넣는 배치는 라이브러리가 막는다(인코더 N 에 디코더 1 이면 예외).
		// 대신 인코더 1 을 디코더 N 으로 늘리는 경로만 지원한다. 디코더가 전체의 63에서 75퍼센트라
		// 재려는 것도 그쪽이다. 시작 토큰을 N 벌 만들어 디코더 배치를 N 으로 만든다.
		const gc = transcriber.model.generation_config;
		const initTokens = [
			gc.decoder_start_token_id,
			gc.lang_to_id['<|ko|>'],
			gc.task_to_id['transcribe']
		];

		const run = async (width, tokens) => {
			const counter = new Counter();
			const started = performance.now();
			await transcriber.model.generate({
				inputs: feat,
				decoder_input_ids: new Array(width).fill(initTokens),
				return_timestamps: false,
				max_new_tokens: tokens,
				streamer: counter
			});
			return { ms: performance.now() - started, steps: counter.steps };
		};

		// 첫 호출은 셰이더 컴파일이 섞이므로 버린다
		window.qaBatch = { ...window.qaBatch, note: 'warmup width 1' };
		await run(1, 20);
		window.qaBatch = { ...window.qaBatch, note: 'warmup width 8' };
		await run(8, 20);

		const rows = [];
		for (const width of ${JSON.stringify(WIDTHS)}) {
			for (const tokens of ${JSON.stringify(TOKEN_COUNTS)}) {
				// 시작할 때 알린다. 끝난 뒤에 알리면 멈춘 셀이 안 보인다
				window.qaBatch = { ...window.qaBatch, note: 'start w' + width + ' t' + tokens };
				const samples = [];
				for (let i = 0; i < ${REPEATS}; i += 1) {
					samples.push(await run(width, tokens));
				}
				rows.push({ width, tokens, samples });
				window.qaBatch = { ...window.qaBatch, note: 'done w' + width + ' t' + tokens };
			}
		}
		window.qaBatch = { done: true, error: null, rows, note: 'done' };
	})().catch((cause) => {
		const detail = cause && cause.cause !== undefined && cause.cause !== null ? String(cause.cause) : null;
		window.qaBatch = { done: true, error: detail ?? String(cause && cause.message ? cause.message : cause), rows: null, note: '' };
	});
	return true;
})()`;

const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-batch-' });

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

try {
	await waitForUrl(url);
	const { send, sessionId } = await chrome.attach();
	await send('Runtime.enable', {}, sessionId);
	await send('Page.navigate', { url }, sessionId);
	await wait(2000);

	const evaluate = createEvaluate(send, sessionId);
	console.log(`파일: ${source}`);
	console.log(`폭 ${WIDTHS.join(', ')} / 토큰 ${TOKEN_COUNTS.join(', ')} / 셀마다 ${REPEATS}회\n`);

	if ((await evaluate(START)) !== true) {
		throw new Error('시작하지 못했다');
	}

	const startedAt = Date.now();
	let state = null;
	let lastNote = '';
	while (true) {
		await wait(POLL_MS);
		state = await evaluate('window.qaBatch ?? null');
		if (state === null) {
			throw new Error('페이지가 다시 불렸다');
		}
		if (state.note && state.note !== lastNote) {
			console.log(`  [${((Date.now() - startedAt) / 60000).toFixed(1)}분] ${state.note}`);
			lastNote = state.note;
		}
		if (state.done) {
			break;
		}
		if (Date.now() - startedAt > IDLE_LIMIT_MS) {
			throw new Error('시간이 너무 걸린다');
		}
	}

	if (state.error) {
		throw new Error(`실패: ${state.error}`);
	}

	console.log('\n폭  토큰  단계  시간중앙(ms)  단계당(ms)');
	const byWidth = new Map();
	for (const row of state.rows) {
		const ms = median(row.samples.map((s) => s.ms));
		const steps = median(row.samples.map((s) => s.steps));
		console.log(
			`${String(row.width).padStart(2)}  ${String(row.tokens).padStart(4)}  ${String(steps).padStart(4)}  ${ms.toFixed(0).padStart(12)}  ${(ms / steps).toFixed(2).padStart(10)}`
		);
		if (!byWidth.has(row.width)) {
			byWidth.set(row.width, []);
		}
		byWidth.get(row.width).push({ tokens: row.tokens, ms, steps });
	}

	console.log('\n폭별 직선 맞춤 (시간 = 절편 + 기울기 x 단계)');
	console.log('폭  기울기(단계당 ms)  절편(인코더 ms)  중점검사');
	for (const [width, points] of byWidth) {
		const xs = points.map((p) => p.steps);
		const ys = points.map((p) => p.ms);
		const n = xs.length;
		const sx = xs.reduce((a, b) => a + b, 0);
		const sy = ys.reduce((a, b) => a + b, 0);
		const sxx = xs.reduce((a, x) => a + x * x, 0);
		const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
		const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
		const intercept = (sy - slope * sx) / n;

		// 20 과 100 의 중점이 60 이다. 직선이면 중점이 양끝 평균과 같다
		const mid = points.find((p) => p.tokens === 60);
		const lo = points.find((p) => p.tokens === 20);
		const hi = points.find((p) => p.tokens === 100);
		const gap = mid && lo && hi ? mid.ms - (lo.ms + hi.ms) / 2 : null;

		console.log(
			`${String(width).padStart(2)}  ${slope.toFixed(2).padStart(16)}  ${intercept.toFixed(0).padStart(15)}  ` +
				(gap === null ? '잴 수 없음' : `${gap.toFixed(0)}ms (${gap < 0 ? '볼록. 절편이 작게 나온다' : '거의 직선'})`)
		);
	}

	const base1 = byWidth.get(1);
	if (base1) {
		console.log('\n절편이 인코더 한 번분에 해당한다. 두 점 연립에서 나온 292ms 와 견줘 볼 값이다.');
	}
} finally {
	await chrome.close();
	server.kill();
	await rm(servedPath, { force: true });
}
