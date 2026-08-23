// 상태 머신을 모든 상태와 계기의 조합으로 돌려 실제 전이 집합을 뽑고
// DESIGN-SPEC 상태 전이 표와 양방향으로 대조한다.
// 표에만 있으면 죽은 전이, 코드에만 있으면 무단 전이다.
import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import type { Transcript } from '../../src/services';
import type { AppEvent, AppState } from '../../src/store/app.state';
import { reduceApp } from '../../src/store/app.state';
import type { AcceptedFile } from '../../src/utils/upload.validation';

test('상태 전이 표와 상태 머신이 양방향으로 일치한다', () => {
	const accepted = { file: new File([], 'a.mp4'), durationSeconds: 10 } as AcceptedFile;
	const transcript: Transcript = { segments: [], durationSeconds: 10 };

	const states: AppState[] = [
		{ name: 'upload', rejection: null },
		{ name: 'confirm', accepted },
		{ name: 'converting', accepted },
		{ name: 'result', accepted, transcript },
		{ name: 'failure', failure: 'DECODE' },
		{ name: 'unsupported' }
	];

	const events: AppEvent[] = [
		{ type: 'FILE_ACCEPTED', accepted },
		{ type: 'FILE_REJECTED', rejection: 'SIZE' },
		{ type: 'CONVERSION_REQUESTED' },
		{ type: 'ANOTHER_FILE_REQUESTED' },
		{ type: 'CONVERSION_SUCCEEDED', transcript },
		{ type: 'CONVERSION_FAILED', failure: 'TRANSCRIBE' },
		{ type: 'NEW_VIDEO_REQUESTED' }
	];

	// 코드가 실제로 만드는 전이. 상태가 그대로면 전이가 아니다
	const codeEdges = new Set<string>();
	for (const state of states) {
		for (const event of events) {
			const next = reduceApp(state, event);
			const changed = next.name !== state.name || JSON.stringify(next) !== JSON.stringify(state);
			if (changed) {
				codeEdges.add(`${state.name} -${event.type}-> ${next.name}`);
			}
		}
	}

	// 표의 전이. 계기 문구를 이벤트 이름에 잇는다
	const KOREAN_TO_STATE: Record<string, string> = {
		업로드: 'upload',
		'변환 확인': 'confirm',
		'변환 진행': 'converting',
		결과: 'result',
		'실패 안내': 'failure'
	};
	const TRIGGER_TO_EVENT: Record<string, string> = {
		'파일이 형식과 크기, 길이 검사를 통과한다': 'FILE_ACCEPTED',
		'파일이 검사에 걸린다': 'FILE_REJECTED',
		'"변환 시작"을 누른다': 'CONVERSION_REQUESTED',
		'"다른 파일 선택"을 누른다': 'ANOTHER_FILE_REQUESTED',
		'모델 준비와 음성 추출, 변환이 모두 끝난다': 'CONVERSION_SUCCEEDED',
		'음성 추출이나 변환이 실패한다': 'CONVERSION_FAILED',
		'"새 영상 변환"을 누른다': 'NEW_VIDEO_REQUESTED'
	};

	const doc = readFileSync('docs/design/DESIGN-SPEC.md', 'utf8');
	const rowPattern = /^\| (업로드|변환 확인|변환 진행|결과|실패 안내)\s*\| (.+?)\s*\| (.+?)\s*\|$/gm;
	const docEdges = new Set<string>();
	const unmapped: string[] = [];

	for (const [, from, trigger, to] of doc.matchAll(rowPattern)) {
		const eventName = TRIGGER_TO_EVENT[trigger];
		const target = KOREAN_TO_STATE[to.split(' (')[0].trim()];
		if (!eventName || !target) {
			unmapped.push(`${from} | ${trigger} | ${to}`);
			continue;
		}
		docEdges.add(`${KOREAN_TO_STATE[from]} -${eventName}-> ${target}`);
	}

	const dead = [...docEdges].filter((edge) => !codeEdges.has(edge));
	const unauthorized = [...codeEdges].filter((edge) => !docEdges.has(edge));

	console.log(`표의 전이 ${docEdges.size}건, 코드의 전이 ${codeEdges.size}건`);
	console.log('\n표와 코드가 일치하는 전이');
	for (const edge of [...docEdges].filter((e) => codeEdges.has(e))) {
		console.log(`  통과  ${edge}`);
	}
	console.log(`\n죽은 전이(표에만 있음): ${dead.length ? '' : '없음'}`);
	for (const edge of dead) console.log(`  실패  ${edge}`);
	console.log(`무단 전이(코드에만 있음): ${unauthorized.length ? '' : '없음'}`);
	for (const edge of unauthorized) console.log(`  실패  ${edge}`);
	console.log(`대조하지 못한 표의 행: ${unmapped.length ? unmapped.join(' / ') : '없음'}`);

	// unsupported에서 나가는 전이가 없어야 한다
	const outFromUnsupported = [...codeEdges].filter((e) => e.startsWith('unsupported '));
	console.log(
		`\nunsupported에서 나가는 전이: ${outFromUnsupported.length ? outFromUnsupported.join(', ') : '없음 (문서와 일치)'}`
	);

	const failures = dead.length + unauthorized.length + unmapped.length + outFromUnsupported.length;
	console.log(`\n실패 ${failures}건`);
	expect(failures).toBe(0);
});
