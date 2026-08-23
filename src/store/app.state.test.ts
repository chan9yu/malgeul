import { describe, expect, it } from 'vitest';

import type { AppEvent, AppState } from './app.state';
import { createInitialAppState, reduceApp } from './app.state';
import { ACCEPTED_FILE as accepted, ALL_EVENTS, ALL_STATES, TRANSCRIPT as transcript } from './app.state.fixture';

type TransitionTable = Record<AppState['name'], Partial<Record<AppEvent['type'], AppState['name']>>>;

const ALLOWED_TRANSITIONS: TransitionTable = {
	upload: { FILE_ACCEPTED: 'confirm', FILE_REJECTED: 'upload' },
	confirm: { CONVERSION_REQUESTED: 'converting', ANOTHER_FILE_REQUESTED: 'upload' },
	converting: { CONVERSION_SUCCEEDED: 'result', CONVERSION_FAILED: 'failure' },
	result: { NEW_VIDEO_REQUESTED: 'upload' },
	failure: { ANOTHER_FILE_REQUESTED: 'upload' },
	unsupported: {}
};

describe('createInitialAppState', () => {
	it('WebGPU가 없으면 비지원 브라우저 안내로 시작한다', () => {
		expect(createInitialAppState(false)).toEqual({ name: 'unsupported' });
	});

	it('WebGPU가 있으면 업로드 화면으로 시작한다', () => {
		expect(createInitialAppState(true)).toEqual({ name: 'upload', rejection: null });
	});
});

describe('reduceApp 전이 표', () => {
	for (const state of ALL_STATES) {
		for (const event of ALL_EVENTS) {
			const expectedName = ALLOWED_TRANSITIONS[state.name][event.type];

			if (expectedName) {
				it(`${state.name}에서 ${event.type}이면 ${expectedName}으로 간다`, () => {
					expect(reduceApp(state, event).name).toBe(expectedName);
				});
				continue;
			}

			it(`${state.name}에서 ${event.type}은 상태를 바꾸지 않는다`, () => {
				expect(reduceApp(state, event)).toBe(state);
			});
		}
	}
});

describe('reduceApp이 옮기는 값', () => {
	it('검사를 통과한 파일을 변환 확인으로 넘긴다', () => {
		const next = reduceApp({ name: 'upload', rejection: null }, { type: 'FILE_ACCEPTED', accepted });

		expect(next).toEqual({ name: 'confirm', accepted });
	});

	it('거절 이유를 업로드 화면에 남긴다', () => {
		const next = reduceApp({ name: 'upload', rejection: null }, { type: 'FILE_REJECTED', rejection: 'SIZE' });

		expect(next).toEqual({ name: 'upload', rejection: 'SIZE' });
	});

	it('거절된 뒤 다른 파일이 통과하면 거절 이유가 사라진다', () => {
		const rejected = reduceApp({ name: 'upload', rejection: null }, { type: 'FILE_REJECTED', rejection: 'SIZE' });
		const next = reduceApp(rejected, { type: 'FILE_ACCEPTED', accepted });

		expect(next).toEqual({ name: 'confirm', accepted });
	});

	it('변환 시작은 확인 화면의 파일을 그대로 들고 간다', () => {
		const next = reduceApp({ name: 'confirm', accepted }, { type: 'CONVERSION_REQUESTED' });

		expect(next).toEqual({ name: 'converting', accepted });
	});

	it('변환이 끝나면 결과가 파일과 변환 결과를 함께 든다', () => {
		const next = reduceApp({ name: 'converting', accepted }, { type: 'CONVERSION_SUCCEEDED', transcript });

		expect(next).toEqual({ name: 'result', accepted, transcript });
	});

	it('변환이 실패하면 실패 코드를 실패 안내로 넘긴다', () => {
		const next = reduceApp({ name: 'converting', accepted }, { type: 'CONVERSION_FAILED', failure: 'RESAMPLE' });

		expect(next).toEqual({ name: 'failure', failure: 'RESAMPLE' });
	});

	it('코드를 가려내지 못한 실패도 그대로 넘긴다', () => {
		const next = reduceApp({ name: 'converting', accepted }, { type: 'CONVERSION_FAILED', failure: 'UNKNOWN' });

		expect(next).toEqual({ name: 'failure', failure: 'UNKNOWN' });
	});

	it('업로드로 돌아가면 거절 이유가 비어 있다', () => {
		const fromFailure = reduceApp({ name: 'failure', failure: 'DECODE' }, { type: 'ANOTHER_FILE_REQUESTED' });
		const fromResult = reduceApp({ name: 'result', accepted, transcript }, { type: 'NEW_VIDEO_REQUESTED' });

		expect(fromFailure).toEqual({ name: 'upload', rejection: null });
		expect(fromResult).toEqual({ name: 'upload', rejection: null });
	});
});
