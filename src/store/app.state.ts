import type { PipelineFailure, Transcript } from '../services';
import type { AcceptedFile, UploadRejection } from '../utils/upload.validation';

export type AppState =
	| { readonly name: 'upload'; readonly rejection: UploadRejection | null }
	| { readonly name: 'confirm'; readonly accepted: AcceptedFile }
	| { readonly name: 'converting'; readonly accepted: AcceptedFile }
	| { readonly name: 'result'; readonly accepted: AcceptedFile; readonly transcript: Transcript }
	| { readonly name: 'failure'; readonly failure: PipelineFailure }
	| { readonly name: 'unsupported' };

export type AppEvent =
	| { readonly type: 'FILE_ACCEPTED'; readonly accepted: AcceptedFile }
	| { readonly type: 'FILE_REJECTED'; readonly rejection: UploadRejection }
	| { readonly type: 'CONVERSION_REQUESTED' } // "변환 시작"
	| { readonly type: 'ANOTHER_FILE_REQUESTED' } // "다른 파일 선택"
	| { readonly type: 'CONVERSION_SUCCEEDED'; readonly transcript: Transcript }
	| { readonly type: 'CONVERSION_FAILED'; readonly failure: PipelineFailure }
	| { readonly type: 'NEW_VIDEO_REQUESTED' }; // "새 영상 변환"

const FRESH_UPLOAD_STATE: AppState = {
	name: 'upload',
	rejection: null
};

export function createInitialAppState(webGpuSupported: boolean): AppState {
	if (!webGpuSupported) {
		return { name: 'unsupported' };
	}

	return FRESH_UPLOAD_STATE;
}

export function reduceApp(state: AppState, event: AppEvent): AppState {
	switch (state.name) {
		case 'upload':
			if (event.type === 'FILE_ACCEPTED') {
				return {
					name: 'confirm',
					accepted: event.accepted
				};
			}

			if (event.type === 'FILE_REJECTED') {
				return {
					name: 'upload',
					rejection: event.rejection
				};
			}

			return state;

		case 'confirm':
			if (event.type === 'CONVERSION_REQUESTED') {
				return {
					name: 'converting',
					accepted: state.accepted
				};
			}

			if (event.type === 'ANOTHER_FILE_REQUESTED') {
				return FRESH_UPLOAD_STATE;
			}

			return state;

		case 'converting':
			if (event.type === 'CONVERSION_SUCCEEDED') {
				return {
					name: 'result',
					accepted: state.accepted,
					transcript: event.transcript
				};
			}

			if (event.type === 'CONVERSION_FAILED') {
				return {
					name: 'failure',
					failure: event.failure
				};
			}

			return state;

		case 'result':
			if (event.type === 'NEW_VIDEO_REQUESTED') {
				return FRESH_UPLOAD_STATE;
			}

			return state;

		case 'failure':
			if (event.type === 'ANOTHER_FILE_REQUESTED') {
				return FRESH_UPLOAD_STATE;
			}

			return state;

		case 'unsupported':
			return state;
	}
}
