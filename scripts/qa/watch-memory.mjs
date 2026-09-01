// 검증 스크립트가 띄운 Chrome 의 메모리를 재는 자리다. 배치 처리처럼 한 번에 쥐는 양이
// 늘어나는 변경에서 그 양이 실제로 얼마나 늘었는지 본다.
//
// WebGPU 버퍼는 표준 API 로 잴 수 없다. performance.memory 도 JS 힙만 센다. 그래서
// 프로세스가 쥔 실제 메모리(RSS)를 대신 잰다. macOS 는 통합 메모리라 GPU 로 올린 버퍼가
// 여기에 일부 반영된다. 정확한 GPU 할당량이 아니라 추세와 봉우리를 보는 값이다.
//
// 사용법: node scripts/qa/watch-memory.mjs [프로필 접두어] [간격초]
//   측정 스크립트와 나란히 띄운다. Chrome 이 뜨면 재기 시작하고 사라지면 요약을 내고 끝난다.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const profilePrefix = process.argv[2] ?? 'malgeul-';
const intervalMs = Number(process.argv[3] ?? 5) * 1000;
const WAIT_LIMIT_MS = 180_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 프로필 이름을 인자로 들고 있는 Chrome 프로세스를 모두 찾는다. 렌더러와 GPU 프로세스가 함께 잡힌다 */
async function findPids() {
	const { stdout } = await run('pgrep', ['-f', profilePrefix]).catch(() => ({ stdout: '' }));

	return stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

/** 킬로바이트 단위 RSS 합계. 죽은 프로세스는 조용히 빠진다 */
async function totalRssKb(pids) {
	if (pids.length === 0) {
		return 0;
	}

	const { stdout } = await run('ps', ['-o', 'rss=', '-p', pids.join(',')]).catch(() => ({ stdout: '' }));

	return stdout.split('\n').reduce((sum, line) => sum + (Number(line.trim()) || 0), 0);
}

/** 로드 평균. 이 기계가 측정 동안 얼마나 바빴는지 남긴다. 못 읽으면 물음표를 둔다 */
async function loadAverage() {
	const { stdout } = await run('uptime').catch(() => ({ stdout: '' }));

	return stdout.match(/load averages?: ([\d.]+)/)?.[1] ?? '?';
}

const clock = () => new Date().toTimeString().slice(0, 8);
const toMb = (kb) => Math.round(kb / 1024);

console.log(`프로필 접두어 "${profilePrefix}" 로 뜬 Chrome 을 ${intervalMs / 1000}초마다 잰다`);

let pids = [];
const startedWaitingAt = Date.now();
while (pids.length === 0) {
	pids = await findPids();
	if (pids.length > 0) {
		break;
	}

	// 끝내 안 뜨면 아무것도 못 잰 채로 0 을 내고 끝나는데, 그 0 을 정상으로 읽으면 안 된다
	if (Date.now() - startedWaitingAt > WAIT_LIMIT_MS) {
		console.error(`측정 불성립: ${WAIT_LIMIT_MS / 1000}초 동안 Chrome 이 뜨지 않았다`);
		process.exit(1);
	}

	await wait(1000);
}

console.log(`프로세스 ${pids.length}개를 찾았다`);

const samples = [];
while (true) {
	const alive = await findPids();
	if (alive.length === 0) {
		break;
	}

	const kb = await totalRssKb(alive);
	const load = await loadAverage();
	samples.push({ kb, count: alive.length, load: Number(load) || 0 });
	console.log(`  [${clock()}] 프로세스 ${alive.length}개, ${toMb(kb)}MB, 로드 ${load}`);
	await wait(intervalMs);
}

if (samples.length === 0) {
	console.error('측정 불성립: 표본을 하나도 얻지 못했다');
	process.exit(1);
}

const peak = samples.reduce((max, s) => (s.kb > max.kb ? s : max), samples[0]);
const average = samples.reduce((sum, s) => sum + s.kb, 0) / samples.length;

console.log(`\n표본 ${samples.length}개`);
console.log(`최대 ${toMb(peak.kb)}MB (프로세스 ${peak.count}개)`);
console.log(`평균 ${toMb(average)}MB`);

// 측정 시간이 흔들릴 때 이 값이 원인 후보를 가른다. 부하가 높았으면 그 측정은 느렸을 수 있다
const loads = samples.map((sample) => sample.load).filter(Boolean);
if (loads.length > 0) {
	const peakLoad = Math.max(...loads);
	const meanLoad = loads.reduce((sum, value) => sum + value, 0) / loads.length;
	console.log(`로드 최대 ${peakLoad.toFixed(2)}, 평균 ${meanLoad.toFixed(2)}`);
}
