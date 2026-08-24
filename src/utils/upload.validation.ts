import { readVideoDuration } from './upload.duration';

export type UploadRejection =
	| 'COUNT' // 한 번에 두 개 이상을 놓았다
	| 'EXTENSION' // 이름이 mp4나 mov로 끝나지 않는다
	| 'SIZE' // 1.9GB를 넘는다
	| 'DURATION' // 2시간을 넘는다
	| 'METADATA'; // 재생 시간을 읽지 못했다

export const UPLOAD_REJECTION_MESSAGE: Record<UploadRejection, string> = {
	COUNT: '파일은 한 번에 하나만 받습니다',
	EXTENSION: 'mp4나 mov 파일만 받습니다',
	SIZE: '파일이 1.9GB를 넘습니다. 더 작은 파일을 올려 주세요.',
	DURATION: '2시간을 넘는 영상은 받을 수 없습니다',
	METADATA: '영상 정보를 읽지 못했습니다. 파일이 손상되었을 수 있습니다'
};

/**
 * Chrome 은 2GiB 이상인 Blob 을 arrayBuffer() 로 읽지 못하고 NotReadableError 를 던진다.
 * 조각내어 읽어도 담을 ArrayBuffer 를 만들지 못한다. 렌더러의 상한이 2047MiB 아래다.
 * 실측으로 2,100,000,000 바이트까지 읽히는 것을 확인했고 여기에 여유를 두어 1900MiB 로 잡는다.
 */
const MAX_FILE_BYTES = 1_992_294_400;
const MAX_DURATION_SECONDS = 7_200;
const ALLOWED_EXTENSIONS = ['.mp4', '.mov'];

/** 검사에 필요한 것만 받는다. File이 이 shape을 그대로 만족한다 */
export interface FileToCheck {
	name: string;
	size: number;
}

export interface AcceptedFile {
	file: File;
	durationSeconds: number;
}

export type FileCheckResult =
	| { kind: 'accepted'; accepted: AcceptedFile }
	| { kind: 'rejected'; rejection: UploadRejection }
	/** 파일 선택 창을 취소해 받은 파일이 없다. 거절이 아니라서 화면을 그대로 둔다 */
	| { kind: 'empty' };

export function checkSelection(files: readonly FileToCheck[]): UploadRejection | null {
	if (files.length !== 1) {
		return 'COUNT';
	}

	const [file] = files;

	if (!hasAllowedExtension(file.name)) {
		return 'EXTENSION';
	}

	if (file.size > MAX_FILE_BYTES) {
		return 'SIZE';
	}

	return null;
}

export function checkDuration(durationSeconds: number): UploadRejection | null {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return 'METADATA';
	}

	if (durationSeconds > MAX_DURATION_SECONDS) {
		return 'DURATION';
	}

	return null;
}

export async function checkPickedFiles(files: readonly File[]): Promise<FileCheckResult> {
	if (files.length === 0) {
		return { kind: 'empty' };
	}

	const selectionRejection = checkSelection(files);

	if (selectionRejection) {
		return {
			kind: 'rejected',
			rejection: selectionRejection
		};
	}

	const [file] = files;
	const durationSeconds = await readVideoDuration(file);
	const durationRejection = checkDuration(durationSeconds);

	if (durationRejection) {
		return {
			kind: 'rejected',
			rejection: durationRejection
		};
	}

	return {
		kind: 'accepted',
		accepted: { file, durationSeconds }
	};
}

function hasAllowedExtension(fileName: string) {
	const lowered = fileName.toLowerCase();

	return ALLOWED_EXTENSIONS.some((extension) => lowered.endsWith(extension));
}
