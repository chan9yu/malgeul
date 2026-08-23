/** 화면 문구는 이 코드로 고른다. AudioExtractionError의 message는 개발자용이라 그대로 보여주지 않는다 */
export type AudioExtractionFailure =
	| 'FILE_READ' // 고른 뒤 파일이 옮겨지거나 지워져 읽지 못했다
	| 'DECODE' // 오디오 트랙이 없거나 내장 디코더가 해독하지 못했다
	| 'EMPTY_AUDIO' // 오디오 트랙을 해독했으나 길이가 0이다
	| 'RESAMPLE'; // 16kHz 모노 렌더링이 실패했다. 대개 메모리가 모자란 경우다

/** 화면 문구는 이 코드로 고른다. TranscriptionError의 message는 개발자용이라 그대로 보여주지 않는다 */
export type TranscriptionFailure =
	| 'MODEL_PREPARE' // 모델 파일을 내려받거나 WebGPU 세션을 만들지 못했다
	| 'TRANSCRIBE' // 음성 인식이 실패했다
	| 'UNKNOWN'; // 어느 단계에서 났는지 가려낼 수 없는 예외다

/** 파이프라인이 던지는 실패 코드 전부. 화면의 문구 대응표가 이 값을 키로 쓴다 */
export type PipelineFailure = AudioExtractionFailure | TranscriptionFailure;

export interface ExtractedAudio {
	/** 16kHz 모노 PCM. 음성 인식이 그대로 받는 입력이다 */
	pcm: Float32Array<ArrayBuffer>;
	/** 항상 16000 */
	sampleRate: number;
	durationSeconds: number;
}

/** 파이프라인이 실행하는 순서다. 진행 화면의 단계 목록도 이 순서로 놓인다 */
export const PIPELINE_STAGES = ['model', 'audio', 'transcribe'] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** 모델을 실제로 내려받는 동안에만 나온다. 캐시에서 읽으면 이 이벤트 없이 model 단계가 끝난다 */
export interface BytesProgress {
	kind: 'bytes';
	stage: 'model';
	loadedBytes: number;
	totalBytes: number;
}

export interface PercentProgress {
	kind: 'percent';
	stage: PipelineStage;
	/** 0 이상 100 이하 */
	percent: number;
}

export type PipelineProgress = BytesProgress | PercentProgress;

export type ProgressListener = (progress: PipelineProgress) => void;

export interface TranscriptSegment {
	startSeconds: number;
	endSeconds: number;
	text: string;
}

export interface Transcript {
	segments: TranscriptSegment[];
	/** 추출한 음성의 길이. 시각 표기를 mm:ss와 h:mm:ss 가운데 고르는 기준이다 */
	durationSeconds: number;
}

/** 내보내기 형식이자 저장 파일의 확장자로 그대로 쓰인다 */
export type ExportFormat = 'txt' | 'srt' | 'vtt';
