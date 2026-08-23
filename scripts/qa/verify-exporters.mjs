/**
 * SPEC의 txt와 srt, vtt 출력 예시를 문서에서 직접 읽어 생성기의 실제 출력과 대조한다.
 * 커밋된 테스트는 기대 출력을 리터럴로 들고 있어 문서가 바뀌어도 옛 값으로 통과한다.
 * 그 어긋남을 잡는 자리라서 테스트와 따로 둔다.
 *
 * 실행: node scripts/qa/verify-exporters.mjs
 */

import { readFileSync } from 'node:fs';

import { createServer } from 'vite';

const SPEC_PATH = 'docs/product/SPEC.md';
const EXPORTER_PATH = '/src/services/export.format.ts';
const PLAIN_FENCE = /^```\n([\s\S]*?)^```$/gm;

const TRANSCRIPT = {
	segments: [
		{ startSeconds: 3.2, endSeconds: 7.5, text: '안녕하세요, 오늘 회의를 시작하겠습니다.' },
		{ startSeconds: 7.5, endSeconds: 12, text: '지난주에 이야기한 일정부터 확인하겠습니다.' }
	],
	durationSeconds: 12
};

const CASES = [
	{ format: 'txt', builder: 'buildTxt', head: '[00:03]' },
	{ format: 'srt', builder: 'buildSrt', head: '1\n' },
	{ format: 'vtt', builder: 'buildVtt', head: 'WEBVTT' }
];

function readSpecBlocks() {
	const spec = readFileSync(SPEC_PATH, 'utf8');

	return Array.from(spec.matchAll(PLAIN_FENCE), (match) => match[1]);
}

async function loadExporters() {
	const options = {
		configFile: 'vite.config.ts',
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'warn'
	};
	const server = await createServer(options);

	try {
		return await server.ssrLoadModule(EXPORTER_PATH);
	} finally {
		await server.close();
	}
}

function findMismatch(actual, expected) {
	const actualLines = actual.split('\n');
	const expectedLines = expected.split('\n');
	const lineCount = Math.max(actualLines.length, expectedLines.length);

	for (let index = 0; index < lineCount; index += 1) {
		if (actualLines[index] !== expectedLines[index]) {
			return [
				`  ${index + 1}번째 줄이 다릅니다`,
				`    SPEC   ${JSON.stringify(expectedLines[index])}`,
				`    생성기 ${JSON.stringify(actualLines[index])}`
			].join('\n');
		}
	}

	return null;
}

function checkCase(exporters, blocks, { format, builder, head }) {
	const expected = blocks.find((block) => block.startsWith(head));

	if (expected === undefined) {
		return `${format}: SPEC에서 예시 덩어리를 찾지 못했습니다`;
	}

	const mismatch = findMismatch(exporters[builder](TRANSCRIPT), expected);

	if (mismatch === null) {
		return null;
	}

	return `${format}: ${builder}의 출력이 예시와 다릅니다\n${mismatch}`;
}

const blocks = readSpecBlocks();
const exporters = await loadExporters();
const failures = CASES.map((testCase) => checkCase(exporters, blocks, testCase)).filter((failure) => failure !== null);

if (failures.length > 0) {
	console.error(`${SPEC_PATH}의 출력 예시와 어긋납니다.\n`);
	console.error(failures.join('\n\n'));
	process.exit(1);
}

console.log(`${SPEC_PATH}의 출력 예시 셋과 생성기 출력이 문자 단위로 같습니다.`);
