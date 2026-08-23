import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { reduceApp } from './app.state';
import { ALL_EVENTS, ALL_STATES } from './app.state.fixture';

const DESIGN_SPEC_PATH = 'docs/design/DESIGN-SPEC.md';

const STATE_BY_KOREAN: Record<string, string> = {
	업로드: 'upload',
	'변환 확인': 'confirm',
	'변환 진행': 'converting',
	결과: 'result',
	'실패 안내': 'failure'
};

const EVENT_BY_TRIGGER: Record<string, string> = {
	'파일이 형식과 크기, 길이 검사를 통과한다': 'FILE_ACCEPTED',
	'파일이 검사에 걸린다': 'FILE_REJECTED',
	'"변환 시작"을 누른다': 'CONVERSION_REQUESTED',
	'"다른 파일 선택"을 누른다': 'ANOTHER_FILE_REQUESTED',
	'모델 준비와 음성 추출, 변환이 모두 끝난다': 'CONVERSION_SUCCEEDED',
	'음성 추출이나 변환이 실패한다': 'CONVERSION_FAILED',
	'"새 영상 변환"을 누른다': 'NEW_VIDEO_REQUESTED'
};

function readCodeEdges() {
	const edges = new Set<string>();

	for (const state of ALL_STATES) {
		for (const event of ALL_EVENTS) {
			const next = reduceApp(state, event);

			if (next !== state) {
				edges.add(`${state.name} -${event.type}-> ${next.name}`);
			}
		}
	}

	return edges;
}

function readDocTable() {
	const rowPattern = /^\| (업로드|변환 확인|변환 진행|결과|실패 안내)\s*\| (.+?)\s*\| (.+?)\s*\|$/gm;
	const doc = readFileSync(DESIGN_SPEC_PATH, 'utf8');
	const edges = new Set<string>();
	const unmapped: string[] = [];

	for (const [, from, trigger, to] of doc.matchAll(rowPattern)) {
		const eventType = EVENT_BY_TRIGGER[trigger];
		const target = STATE_BY_KOREAN[to.split(' (')[0].trim()];

		if (!eventType || !target) {
			unmapped.push(`${from} | ${trigger} | ${to}`);
			continue;
		}

		edges.add(`${STATE_BY_KOREAN[from]} -${eventType}-> ${target}`);
	}

	return {
		edges,
		unmapped
	};
}

describe('DESIGN-SPEC 상태 전이 표와 reduceApp', () => {
	it('표에서 전이 행을 읽어낸다', () => {
		expect(readDocTable().edges.size).toBeGreaterThan(0);
	});

	it('표의 모든 행을 상태와 계기로 대조한다', () => {
		expect(readDocTable().unmapped).toEqual([]);
	});

	it('표에만 있고 리듀서에는 없는 죽은 전이가 없다', () => {
		const codeEdges = readCodeEdges();
		const dead = [...readDocTable().edges].filter((edge) => !codeEdges.has(edge));

		expect(dead).toEqual([]);
	});

	it('리듀서에만 있고 표에는 없는 무단 전이가 없다', () => {
		const docEdges = readDocTable().edges;
		const unauthorized = [...readCodeEdges()].filter((edge) => !docEdges.has(edge));

		expect(unauthorized).toEqual([]);
	});

	it('비지원 브라우저 안내에서 나가는 전이가 없다', () => {
		const outgoing = [...readCodeEdges()].filter((edge) => edge.startsWith('unsupported '));

		expect(outgoing).toEqual([]);
	});
});
