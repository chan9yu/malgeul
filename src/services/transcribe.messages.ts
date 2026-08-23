import type { TranscriptionFailure, TranscriptSegment } from './types';

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
	| { type: 'transcribe-progress'; processedSeconds: number; totalSeconds: number }
	| { type: 'transcribe-done'; segments: TranscriptSegment[] }
	| { type: 'failed'; failure: TranscriptionFailure; message: string };
