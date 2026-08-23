import type { Transcript } from '../services';
import type { AcceptedFile } from '../utils/upload.validation';
import type { AppEvent, AppState } from './app.state';

export const ACCEPTED_FILE: AcceptedFile = {
	file: new File([], 'meeting.mp4'),
	durationSeconds: 12
};

export const TRANSCRIPT: Transcript = {
	segments: [{ startSeconds: 0, endSeconds: 3, text: '안녕하세요' }],
	durationSeconds: 12
};

/** AppState 전부. 상태를 늘리면 여기에 넣어야 두 전이 검사가 함께 본다 */
export const ALL_STATES: readonly AppState[] = [
	{ name: 'upload', rejection: null },
	{ name: 'confirm', accepted: ACCEPTED_FILE },
	{ name: 'converting', accepted: ACCEPTED_FILE },
	{ name: 'result', accepted: ACCEPTED_FILE, transcript: TRANSCRIPT },
	{ name: 'failure', failure: 'DECODE' },
	{ name: 'unsupported' }
];

/** AppEvent 전부. 계기를 늘리면 여기에 넣어야 두 전이 검사가 함께 본다 */
export const ALL_EVENTS: readonly AppEvent[] = [
	{ type: 'FILE_ACCEPTED', accepted: ACCEPTED_FILE },
	{ type: 'FILE_REJECTED', rejection: 'SIZE' },
	{ type: 'CONVERSION_REQUESTED' },
	{ type: 'ANOTHER_FILE_REQUESTED' },
	{ type: 'CONVERSION_SUCCEEDED', transcript: TRANSCRIPT },
	{ type: 'CONVERSION_FAILED', failure: 'DECODE' },
	{ type: 'NEW_VIDEO_REQUESTED' }
];
