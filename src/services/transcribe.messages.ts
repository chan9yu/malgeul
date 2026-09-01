import type { TranscribePlanSummary, TranscriptionFailure, TranscriptSegment } from './types';

export type WorkerRequest =
	| { type: 'load' }
	| {
			type: 'transcribe';
			/** 16kHz 모노 PCM. transfer 목록에 넣어 복사 없이 넘긴다 */
			pcm: Float32Array<ArrayBuffer>;
			sampleRate: number;
	  };

export type WorkerResponse =
	| { type: 'model-bytes'; loadedBytes: number; totalBytes: number }
	| { type: 'model-ready' }
	| {
			type: 'transcribe-progress';
			processedSeconds: number;
			totalSeconds: number;
			/** 아래는 계측용 선택 필드다. 화면은 읽지 않는다 */
			windowMs?: number;
			windowIndex?: number;
			windowCount?: number;
	  }
	| {
			type: 'transcribe-done';
			segments: TranscriptSegment[];
			/** 아래는 계측용 선택 필드다 */
			transcribeMs?: number;
			windowMsList?: number[];
			windowTokenCounts?: number[][];
			trimmedByWindow?: number[];
			phraseRepeatsByWindow?: number[];
			repeatedSegmentChars?: number;
			plan?: TranscribePlanSummary;
	  }
	| { type: 'failed'; failure: TranscriptionFailure; message: string };
