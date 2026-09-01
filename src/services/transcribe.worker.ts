import { type AutomaticSpeechRecognitionPipeline, env, pipeline, type ProgressInfo } from '@huggingface/transformers';

import { findSilenceGaps } from './audio.silence';
import {
	MODEL_DEVICE,
	MODEL_DTYPE,
	MODEL_ID,
	TRANSCRIBE_LANGUAGE,
	TRANSCRIBE_MAX_NEW_TOKENS,
	TRANSCRIBE_TASK,
	WHISPER_CHUNK_SECONDS,
	WHISPER_STRIDE_SECONDS
} from './model.config';
import { toDisplayMegabytes } from './progress.format';
import type { WorkerRequest, WorkerResponse } from './transcribe.messages';
import { toSegments } from './transcribe.parse';
import { countPhraseRepetition, countRepeatedSegments, trimRepetition } from './transcribe.repetition';
import { mergeWindows, planWindowsWithPlan, type TranscriptionWindow, type WindowResult } from './transcribe.window';

/** DOM과 WebWorker lib은 함께 켤 수 없어서 워커 전역 가운데 쓰는 것만 적는다 */
interface WorkerScope {
	postMessage(response: WorkerResponse): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
}

declare const self: WorkerScope;
declare const performance: { now(): number };

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

/**
 * generate 호출마다 몇 토큰을 냈는지 센다. 배치 이득의 상한이 배치 크기가 아니라 합 나누기
 * 최대라서 이 값이 있어야 예측이 선다. 호출 수 자체는 seek 루프가 몇 번 도는지도 알려준다.
 */
class GenerateCounter {
	readonly calls: number[] = [];
	private steps = -1;

	put() {
		// 첫 put 은 프롬프트라 생성 토큰이 아니다
		this.steps += 1;
	}

	end() {
		this.calls.push(Math.max(0, this.steps));
		this.steps = -1;
	}
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

	const counter = new GenerateCounter();
	const output = await loaded(slice, {
		language: TRANSCRIBE_LANGUAGE,
		task: TRANSCRIBE_TASK,
		return_timestamps: true,
		chunk_length_s: WHISPER_CHUNK_SECONDS,
		stride_length_s: WHISPER_STRIDE_SECONDS,
		// 선언된 타입은 TextStreamer 전체를 요구하지만 generate 가 실제로 부르는 것은 put 과 end 뿐이다.
		// BaseStreamer 는 패키지 밖으로 안 나와서 상속할 수 없다
		// @ts-expect-error 라이브러리 타입이 런타임 계약보다 좁다
		streamer: counter,
		...(TRANSCRIBE_MAX_NEW_TOKENS === null ? {} : { max_new_tokens: TRANSCRIBE_MAX_NEW_TOKENS })
	});

	// 창을 확정하는 자리에서 줄인다. 병합 뒤에는 어느 조각이 냈는지 모른다
	let trimmedChars = 0;
	let phraseRepeats = 0;
	const segments = toSegments(output.chunks, window.sliceEndSeconds - window.sliceStartSeconds).map((segment) => {
		const trimmed = trimRepetition(segment.text);
		trimmedChars += trimmed.trimmedChars;
		// 세기만 한다. 자를지는 이 값이 쌓인 뒤에 정한다
		phraseRepeats += countPhraseRepetition(trimmed.text);

		return trimmed.trimmedChars === 0 ? segment : { ...segment, text: trimmed.text };
	});

	return { segments, tokenCounts: counter.calls, trimmedChars, phraseRepeats };
}

async function runTranscription(pcm: Float32Array, sampleRate: number) {
	const loaded = transcriber;
	if (!loaded) {
		throw new Error('transcribe requested before the model was loaded');
	}

	const totalSeconds = pcm.length / sampleRate;
	const plan = planWindowsWithPlan(totalSeconds, findSilenceGaps(pcm, sampleRate));
	const results: WindowResult[] = [];
	const windowMsList: number[] = [];
	const windowTokenCounts: number[][] = [];
	const trimmedByWindow: number[] = [];
	const phraseRepeatsByWindow: number[] = [];
	const startedAt = performance.now();

	for (const [index, window] of plan.windows.entries()) {
		const windowStartedAt = performance.now();
		const produced = await transcribeWindow(loaded, pcm, sampleRate, window);
		results.push({ window, segments: produced.segments });
		windowTokenCounts.push(produced.tokenCounts);
		trimmedByWindow.push(produced.trimmedChars);
		phraseRepeatsByWindow.push(produced.phraseRepeats);

		const windowMs = Math.round(performance.now() - windowStartedAt);
		windowMsList.push(windowMs);
		post({
			type: 'transcribe-progress',
			processedSeconds: window.coreEndSeconds,
			totalSeconds,
			windowMs,
			windowIndex: index,
			windowCount: plan.windows.length
		});
	}

	const merged = mergeWindows(results);

	post({
		type: 'transcribe-done',
		segments: merged,
		repeatedSegmentChars: countRepeatedSegments(merged.map((segment) => segment.text)),
		transcribeMs: Math.round(performance.now() - startedAt),
		windowMsList,
		windowTokenCounts,
		trimmedByWindow,
		phraseRepeatsByWindow,
		plan: {
			windowSeconds: plan.windowSeconds,
			windowCount: plan.windows.length,
			chunkCount: plan.chunkCount,
			chunkCounts: plan.chunkCounts,
			skippedRanges: plan.skippedRanges,
			silenceGapCount: plan.silenceGapCount,
			minSilenceSeconds: Number.isFinite(plan.minSilenceSeconds) ? plan.minSilenceSeconds : null,
			skippedSilenceSeconds: Math.round(plan.skippedSilenceSeconds)
		}
	});
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
		const failure = request.type === 'load' ? 'MODEL_PREPARE' : 'TRANSCRIBE';
		post({ type: 'failed', failure, message: describeCause(cause) });
	}
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
	void handleRequest(event.data);
});
