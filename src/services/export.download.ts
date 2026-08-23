import { buildExportText, toExportFileName } from './export.format';
import type { ExportFormat, Transcript } from './types';

const MIME_TYPES: Record<ExportFormat, string> = {
	txt: 'text/plain;charset=utf-8',
	srt: 'application/x-subrip;charset=utf-8',
	vtt: 'text/vtt;charset=utf-8'
};

export function downloadTranscript(transcript: Transcript, sourceFileName: string, format: ExportFormat) {
	const text = buildExportText(transcript, format);
	const blob = new Blob([text], { type: MIME_TYPES[format] });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	anchor.href = objectUrl;
	anchor.download = toExportFileName(sourceFileName, format);
	anchor.click();

	URL.revokeObjectURL(objectUrl);
}
