import { formatSrtTime, formatTimecode, formatVttTime } from '../utils/timecode';
import type { ExportFormat, Transcript } from './types';

const LINE = '\n';
const BLANK_LINE = '\n\n';
const TIME_RANGE = ' --> ';
const VTT_HEADER = 'WEBVTT';

export function buildTxt({ segments, durationSeconds }: Transcript) {
	const lines = segments.map(
		(segment) => `[${formatTimecode(segment.startSeconds, durationSeconds)}] ${toSingleLine(segment.text)}`
	);

	return toFileText(lines, LINE);
}

export function buildSrt({ segments }: Transcript) {
	const cues = segments.map((segment, index) => {
		const range = `${formatSrtTime(segment.startSeconds)}${TIME_RANGE}${formatSrtTime(segment.endSeconds)}`;

		return [String(index + 1), range, toSingleLine(segment.text)].join(LINE);
	});

	return toFileText(cues, BLANK_LINE);
}

export function buildVtt({ segments }: Transcript) {
	const cues = segments.map((segment) => {
		const range = `${formatVttTime(segment.startSeconds)}${TIME_RANGE}${formatVttTime(segment.endSeconds)}`;

		return [range, toSingleLine(segment.text)].join(LINE);
	});

	return toFileText([VTT_HEADER, ...cues], BLANK_LINE);
}

const BUILDERS: Record<ExportFormat, (transcript: Transcript) => string> = {
	txt: buildTxt,
	srt: buildSrt,
	vtt: buildVtt
};

export function buildExportText(transcript: Transcript, format: ExportFormat) {
	return BUILDERS[format](transcript);
}

export function toExportFileName(sourceFileName: string, format: ExportFormat) {
	const extensionAt = sourceFileName.lastIndexOf('.');
	const baseName = extensionAt > 0 ? sourceFileName.slice(0, extensionAt) : sourceFileName;

	return `${baseName}.${format}`;
}

/** srt와 vtt는 빈 줄로 항목을 가른다. 문장 안의 줄바꿈을 그대로 두면 항목 경계로 읽힌다 */
function toSingleLine(text: string) {
	return text
		.split(/\r\n|\r|\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join(' ');
}

function toFileText(blocks: string[], separator: string) {
	if (blocks.length === 0) {
		return '';
	}

	return `${blocks.join(separator)}${LINE}`;
}
