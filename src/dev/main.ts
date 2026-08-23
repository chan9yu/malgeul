import {
	AudioExtractionError,
	extractAudio,
	type ExtractedAudio,
	formatBytesProgress,
	isModelCached,
	type PipelineFailure,
	type PipelineProgress,
	type PipelineStage,
	transcribeVideo,
	type Transcript,
	TranscriptionError
} from '../services';
import { encodeWav } from './wav.encoder';

const MS_PER_SECOND = 1000;
const SECOND_FRACTION_DIGITS = 2;

const FAILURE_TEXT: Record<PipelineFailure, string> = {
	FILE_READ: '파일에서 바이트를 읽지 못했습니다',
	DECODE: '오디오 트랙이 없거나 브라우저가 해독하지 못하는 파일입니다',
	EMPTY_AUDIO: '오디오 트랙을 해독했으나 길이가 0입니다',
	RESAMPLE: '16kHz 모노로 렌더링하지 못했습니다',
	MODEL_DOWNLOAD: '음성 인식 모델을 준비하지 못했습니다',
	TRANSCRIBE: '음성을 텍스트로 바꾸지 못했습니다',
	UNKNOWN: '어느 단계인지 가려낼 수 없는 오류입니다'
};

const STAGE_TEXT: Record<PipelineStage, string> = {
	model: '모델 준비',
	audio: '음성 추출',
	transcribe: '변환'
};

const STAGE_ORDER: PipelineStage[] = ['model', 'audio', 'transcribe'];

function findElement<T extends Element>(selector: string, elementType: new () => T) {
	const element = document.querySelector(selector);
	if (!(element instanceof elementType)) {
		throw new Error(`개발 페이지에서 ${selector} 요소를 찾지 못했습니다`);
	}

	return element;
}

const fileInput = findElement('#video-file', HTMLInputElement);
const extractButton = findElement('#extract-button', HTMLButtonElement);
const transcribeButton = findElement('#transcribe-button', HTMLButtonElement);
const statusText = findElement('#status-text', HTMLParagraphElement);
const cacheText = findElement('#cache-text', HTMLSpanElement);
const cacheButton = findElement('#cache-button', HTMLButtonElement);
const stageList = findElement('#stage-list', HTMLUListElement);
const stageProgress = findElement('#stage-progress', HTMLProgressElement);
const resultList = findElement('#result-list', HTMLDListElement);
const player = findElement('#pcm-player', HTMLAudioElement);
const segmentSummary = findElement('#segment-summary', HTMLParagraphElement);
const segmentTable = findElement('#segment-table', HTMLTableElement);
const segmentBody = findElement('#segment-body', HTMLTableSectionElement);

let previewUrl: string | null = null;

function clearPreview() {
	if (previewUrl) {
		URL.revokeObjectURL(previewUrl);
		previewUrl = null;
	}

	player.removeAttribute('src');
	player.load();
}

function renderRows(rows: Array<[string, string]>) {
	resultList.replaceChildren();

	for (const [label, value] of rows) {
		const term = document.createElement('dt');
		term.textContent = label;

		const detail = document.createElement('dd');
		detail.textContent = value;

		resultList.append(term, detail);
	}
}

function formatSeconds(seconds: number) {
	return `${seconds.toFixed(SECOND_FRACTION_DIGITS)}초`;
}

function showAudioResult(file: File, audio: ExtractedAudio, elapsedMs: number) {
	renderRows([
		['파일', file.name],
		['걸린 시간', formatSeconds(elapsedMs / MS_PER_SECOND)],
		['샘플레이트', `${audio.sampleRate} Hz`],
		['PCM 길이', `${audio.pcm.length.toLocaleString('ko-KR')} 샘플`],
		['음성 길이', formatSeconds(audio.durationSeconds)]
	]);

	const wav = encodeWav(audio.pcm, audio.sampleRate);
	previewUrl = URL.createObjectURL(wav);
	player.src = previewUrl;
}

function describeFailure(cause: unknown) {
	if (cause instanceof AudioExtractionError || cause instanceof TranscriptionError) {
		return `실패 [${cause.failure}] ${FAILURE_TEXT[cause.failure]}`;
	}

	return `예상하지 못한 오류: ${String(cause)}`;
}

function clearStages() {
	stageList.replaceChildren();
	stageProgress.value = 0;
}

function renderStages(current: PipelineStage, detail: string) {
	const currentIndex = STAGE_ORDER.indexOf(current);

	stageList.replaceChildren(
		...STAGE_ORDER.map((stage, index) => {
			const item = document.createElement('li');
			const mark = index < currentIndex ? '완료' : index === currentIndex ? '진행 중' : '대기';
			const suffix = index === currentIndex ? ` ${detail}` : '';
			item.textContent = `${STAGE_TEXT[stage]} [${mark}]${suffix}`;

			return item;
		})
	);
}

function showProgress(progress: PipelineProgress) {
	if (progress.kind === 'bytes') {
		renderStages(progress.stage, formatBytesProgress(progress));
		stageProgress.value = (progress.loadedBytes / Math.max(1, progress.totalBytes)) * 100;
		return;
	}

	renderStages(progress.stage, `${progress.percent}%`);
	stageProgress.value = progress.percent;
}

function renderSegments(transcript: Transcript) {
	segmentBody.replaceChildren(
		...transcript.segments.map((segment, index) => {
			const row = document.createElement('tr');

			for (const value of [String(index + 1), formatSeconds(segment.startSeconds), formatSeconds(segment.endSeconds)]) {
				const cell = document.createElement('td');
				cell.className = 'time';
				cell.textContent = value;
				row.append(cell);
			}

			const textCell = document.createElement('td');
			textCell.textContent = segment.text;
			row.append(textCell);

			return row;
		})
	);

	segmentTable.hidden = transcript.segments.length === 0;
	segmentSummary.textContent = `구간 ${transcript.segments.length}개, 음성 길이 ${formatSeconds(transcript.durationSeconds)}`;
}

async function showCacheState() {
	const cached = await isModelCached();
	cacheText.textContent = cached
		? '모델이 캐시에 있습니다. 다운로드 없이 시작합니다'
		: '캐시가 비어 있습니다. 모델을 내려받습니다';
}

function setBusy(busy: boolean) {
	const hasFile = Boolean(fileInput.files?.[0]);
	extractButton.disabled = busy || !hasFile;
	transcribeButton.disabled = busy || !hasFile;
	cacheButton.disabled = busy;
}

function resetOutput() {
	resultList.replaceChildren();
	segmentBody.replaceChildren();
	segmentTable.hidden = true;
	segmentSummary.textContent = '아직 변환하지 않았습니다';
	clearStages();
	clearPreview();
}

async function runExtraction(file: File) {
	setBusy(true);
	statusText.textContent = '추출하고 있습니다';
	resetOutput();

	const startedAt = performance.now();

	try {
		const audio = await extractAudio(file);
		statusText.textContent = '추출 성공';
		showAudioResult(file, audio, performance.now() - startedAt);
	} catch (cause) {
		console.error(cause);
		statusText.textContent = describeFailure(cause);
	} finally {
		setBusy(false);
	}
}

async function runTranscription(file: File) {
	setBusy(true);
	statusText.textContent = '변환하고 있습니다';
	resetOutput();

	const startedAt = performance.now();

	try {
		const transcript = await transcribeVideo(file, showProgress);
		statusText.textContent = `변환 성공. 걸린 시간 ${formatSeconds((performance.now() - startedAt) / MS_PER_SECOND)}`;
		renderSegments(transcript);
		await showCacheState();
	} catch (cause) {
		console.error(cause);
		statusText.textContent = describeFailure(cause);
	} finally {
		setBusy(false);
	}
}

fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	statusText.textContent = file ? `${file.name} 준비됨` : '파일을 고르세요';
	resetOutput();
	setBusy(false);
});

extractButton.addEventListener('click', () => {
	const file = fileInput.files?.[0];
	if (!file) {
		return;
	}

	void runExtraction(file);
});

transcribeButton.addEventListener('click', () => {
	const file = fileInput.files?.[0];
	if (!file) {
		return;
	}

	void runTranscription(file);
});

cacheButton.addEventListener('click', () => {
	void showCacheState();
});

void showCacheState();
