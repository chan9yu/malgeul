import { AudioExtractionError } from '../pipeline/audio.error';
import { extractAudio } from '../pipeline/audio.extractor';
import type { AudioExtractionFailure, ExtractedAudio } from '../pipeline/types';
import { encodeWav } from './wav.encoder';

const MS_PER_SECOND = 1000;
const SECOND_FRACTION_DIGITS = 2;

const FAILURE_TEXT: Record<AudioExtractionFailure, string> = {
	FILE_READ: '파일에서 바이트를 읽지 못했습니다',
	DECODE: '오디오 트랙이 없거나 브라우저가 해독하지 못하는 파일입니다',
	EMPTY_AUDIO: '오디오 트랙을 해독했으나 길이가 0입니다',
	RESAMPLE: '16kHz 모노로 렌더링하지 못했습니다'
};

function findElement<T extends Element>(selector: string, elementType: new () => T) {
	const element = document.querySelector(selector);
	if (!(element instanceof elementType)) {
		throw new Error(`개발 페이지에서 ${selector} 요소를 찾지 못했습니다`);
	}

	return element;
}

const fileInput = findElement('#video-file', HTMLInputElement);
const extractButton = findElement('#extract-button', HTMLButtonElement);
const statusText = findElement('#status-text', HTMLParagraphElement);
const resultList = findElement('#result-list', HTMLDListElement);
const player = findElement('#pcm-player', HTMLAudioElement);

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

function showResult(file: File, audio: ExtractedAudio, elapsedMs: number) {
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
	if (cause instanceof AudioExtractionError) {
		return `추출 실패 [${cause.failure}] ${FAILURE_TEXT[cause.failure]}`;
	}

	return `예상하지 못한 오류: ${String(cause)}`;
}

async function runExtraction(file: File) {
	extractButton.disabled = true;
	statusText.textContent = '추출하고 있습니다';
	resultList.replaceChildren();
	clearPreview();

	const startedAt = performance.now();

	try {
		const audio = await extractAudio(file);
		statusText.textContent = '추출 성공';
		showResult(file, audio, performance.now() - startedAt);
	} catch (cause) {
		console.error(cause);
		statusText.textContent = describeFailure(cause);
	} finally {
		extractButton.disabled = false;
	}
}

fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	extractButton.disabled = !file;
	statusText.textContent = file ? `${file.name} 준비됨` : '파일을 고르세요';
	resultList.replaceChildren();
	clearPreview();
});

extractButton.addEventListener('click', () => {
	const file = fileInput.files?.[0];
	if (!file) {
		return;
	}

	void runExtraction(file);
});
