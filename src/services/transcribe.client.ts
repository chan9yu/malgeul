import { AudioExtractionError } from './audio.error';
import { extractAudio } from './audio.extractor';
import { toPercent } from './progress.format';
import { TranscriptionError } from './transcribe.error';
import type { WorkerRequest, WorkerResponse } from './transcribe.messages';
import type { ExtractedAudio, ProgressListener, Transcript, TranscriptionFailure, TranscriptSegment } from './types';

interface WorkerStage {
	worker: Worker;
	request: WorkerRequest;
	transfer?: Transferable[];
	/** 워커가 응답 없이 죽었을 때 던질 코드 */
	crashFailure: TranscriptionFailure;
	doneType: WorkerResponse['type'];
	onUpdate: (response: WorkerResponse) => void;
}

/** 실패하면 failure에 코드가 담긴 AudioExtractionError나 TranscriptionError를 던진다 */
export async function transcribeVideo(file: File, onProgress?: ProgressListener): Promise<Transcript> {
	let worker: Worker | null = null;

	try {
		worker = createWorker();
		await loadModel(worker, onProgress);
		const audio = await getAudio(file, onProgress);
		const segments = await runTranscription(worker, audio, onProgress);

		return {
			segments,
			durationSeconds: audio.durationSeconds
		};
	} catch (cause) {
		throw toPipelineError(cause);
	} finally {
		worker?.terminate();
	}
}

function toPipelineError(cause: unknown) {
	if (cause instanceof AudioExtractionError || cause instanceof TranscriptionError) {
		return cause;
	}

	return new TranscriptionError('UNKNOWN', cause);
}

function createWorker() {
	return new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
}

function runWorkerStage({ worker, request, transfer, crashFailure, doneType, onUpdate }: WorkerStage) {
	return new Promise<WorkerResponse>((resolve, reject) => {
		function stopListening() {
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
		}

		function handleMessage(event: MessageEvent<WorkerResponse>) {
			const response = event.data;

			if (response.type === 'failed') {
				stopListening();
				reject(new TranscriptionError(response.failure, response.message));
				return;
			}

			if (response.type === doneType) {
				stopListening();
				resolve(response);
				return;
			}

			onUpdate(response);
		}

		function handleError(event: ErrorEvent) {
			stopListening();
			reject(new TranscriptionError(crashFailure, event.message));
		}

		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);
		worker.postMessage(request, transfer ?? []);
	});
}

async function loadModel(worker: Worker, onProgress?: ProgressListener) {
	onProgress?.({ kind: 'percent', stage: 'model', percent: 0 });

	await runWorkerStage({
		worker,
		request: { type: 'load' },
		crashFailure: 'MODEL_DOWNLOAD',
		doneType: 'model-ready',
		onUpdate: (response) => {
			if (response.type !== 'model-bytes') {
				return;
			}

			onProgress?.({
				kind: 'bytes',
				stage: 'model',
				loadedBytes: response.loadedBytes,
				totalBytes: response.totalBytes
			});
		}
	});

	onProgress?.({ kind: 'percent', stage: 'model', percent: 100 });
}

async function getAudio(file: File, onProgress?: ProgressListener) {
	onProgress?.({ kind: 'percent', stage: 'audio', percent: 0 });
	const audio = await extractAudio(file);
	onProgress?.({ kind: 'percent', stage: 'audio', percent: 100 });

	return audio;
}

async function runTranscription(
	worker: Worker,
	audio: ExtractedAudio,
	onProgress?: ProgressListener
): Promise<TranscriptSegment[]> {
	onProgress?.({ kind: 'percent', stage: 'transcribe', percent: 0 });

	const request: WorkerRequest = { type: 'transcribe', pcm: audio.pcm, sampleRate: audio.sampleRate };
	const response = await runWorkerStage({
		worker,
		request,
		transfer: [audio.pcm.buffer],
		crashFailure: 'TRANSCRIBE',
		doneType: 'transcribe-done',
		onUpdate: (update) => {
			if (update.type !== 'transcribe-progress') {
				return;
			}

			const percent = toPercent(update.processedSeconds, update.totalSeconds);
			onProgress?.({ kind: 'percent', stage: 'transcribe', percent });
		}
	});

	if (response.type !== 'transcribe-done') {
		throw new TranscriptionError('TRANSCRIBE');
	}

	onProgress?.({ kind: 'percent', stage: 'transcribe', percent: 100 });

	return response.segments;
}
