import { type AutomaticSpeechRecognitionPipeline, env, pipeline, type ProgressInfo } from '@huggingface/transformers';

import {
	MODEL_DEVICE,
	MODEL_DTYPE,
	MODEL_ID,
	TRANSCRIBE_LANGUAGE,
	TRANSCRIBE_TASK,
	WHISPER_CHUNK_SECONDS,
	WHISPER_STRIDE_SECONDS
} from './model.config';
import { toDisplayMegabytes } from './progress.format';
import type { WorkerRequest, WorkerResponse } from './transcribe.messages';
import { toSegments } from './transcribe.parse';
import { mergeWindows, planWindows, type TranscriptionWindow, type WindowResult } from './transcribe.window';

/** DOM과 WebWorker lib은 함께 켤 수 없어서 워커 전역 가운데 쓰는 것만 적는다 */
interface WorkerScope {
	postMessage(response: WorkerResponse): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
}

declare const self: WorkerScope;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let reportedMegabytes = -1;

function post(response: WorkerResponse) {
	self.postMessage(response);
}

function reportModelBytes(info: ProgressInfo) {
	if (info.status !== 'progress_total') {
		return;
	}

	const megabytes = toDisplayMegabytes(info.loaded);
	if (megabytes === reportedMegabytes) {
		return;
	}

	reportedMegabytes = megabytes;
	post({ type: 'model-bytes', loadedBytes: info.loaded, totalBytes: info.total });
}

/**
 * transformers.js는 불러오는 순간 wasmPaths를 jsdelivr 주소로 채운다. 비워 두면 onnxruntime-web이
 * 번들러가 함께 내보낸 같은 출처의 wasm을 쓴다. 밖으로 나가는 요청은 모델 다운로드 하나여야 한다.
 */
function pointWasmAtBundledRuntime() {
	const wasm = env.backends?.onnx?.wasm;
	if (!wasm) {
		return;
	}

	wasm.wasmPaths = undefined;
}

async function loadModel() {
	pointWasmAtBundledRuntime();
	transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
		device: MODEL_DEVICE,
		dtype: MODEL_DTYPE,
		progress_callback: reportModelBytes
	});

	post({ type: 'model-ready' });
}

async function transcribeWindow(
	loaded: AutomaticSpeechRecognitionPipeline,
	pcm: Float32Array,
	sampleRate: number,
	window: TranscriptionWindow
) {
	const slice = pcm.subarray(
		Math.floor(window.sliceStartSeconds * sampleRate),
		Math.ceil(window.sliceEndSeconds * sampleRate)
	);

	const output = await loaded(slice, {
		language: TRANSCRIBE_LANGUAGE,
		task: TRANSCRIBE_TASK,
		return_timestamps: true,
		chunk_length_s: WHISPER_CHUNK_SECONDS,
		stride_length_s: WHISPER_STRIDE_SECONDS
	});

	return toSegments(output.chunks, window.sliceEndSeconds - window.sliceStartSeconds);
}

async function runTranscription(pcm: Float32Array, sampleRate: number) {
	const loaded = transcriber;
	if (!loaded) {
		throw new Error('transcribe requested before the model was loaded');
	}

	const totalSeconds = pcm.length / sampleRate;
	const results: WindowResult[] = [];

	for (const window of planWindows(totalSeconds)) {
		const segments = await transcribeWindow(loaded, pcm, sampleRate, window);
		results.push({ window, segments });
		post({ type: 'transcribe-progress', processedSeconds: window.coreEndSeconds, totalSeconds });
	}

	post({ type: 'transcribe-done', segments: mergeWindows(results) });
}

function describeCause(cause: unknown) {
	return cause instanceof Error ? cause.message : String(cause);
}

async function handleRequest(request: WorkerRequest) {
	try {
		if (request.type === 'load') {
			await loadModel();
			return;
		}

		await runTranscription(request.pcm, request.sampleRate);
	} catch (cause) {
		const failure = request.type === 'load' ? 'MODEL_DOWNLOAD' : 'TRANSCRIBE';
		post({ type: 'failed', failure, message: describeCause(cause) });
	}
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
	void handleRequest(event.data);
});
