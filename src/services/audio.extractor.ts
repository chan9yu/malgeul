import { AudioExtractionError } from './audio.error';
import type { ExtractedAudio } from './types';

const TARGET_SAMPLE_RATE = 16_000;
const TARGET_CHANNEL_COUNT = 1;
const DECODE_PROBE_FRAME_COUNT = 1;

export async function extractAudio(file: File): Promise<ExtractedAudio> {
	const bytes = await readFileBytes(file);
	const decoded = await decodeAudioTrack(bytes);
	if (decoded.length === 0) {
		throw new AudioExtractionError('EMPTY_AUDIO');
	}

	const pcm = await renderMonoPcm(decoded);

	return {
		pcm,
		sampleRate: TARGET_SAMPLE_RATE,
		durationSeconds: pcm.length / TARGET_SAMPLE_RATE
	};
}

async function readFileBytes(file: File) {
	try {
		return await file.arrayBuffer();
	} catch (cause) {
		throw new AudioExtractionError('FILE_READ', cause);
	}
}

async function decodeAudioTrack(bytes: ArrayBuffer) {
	const probe = new OfflineAudioContext(TARGET_CHANNEL_COUNT, DECODE_PROBE_FRAME_COUNT, TARGET_SAMPLE_RATE);

	try {
		return await probe.decodeAudioData(bytes);
	} catch (cause) {
		throw new AudioExtractionError('DECODE', cause);
	}
}

async function renderMonoPcm(decoded: AudioBuffer) {
	const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);

	try {
		const target = new OfflineAudioContext(TARGET_CHANNEL_COUNT, frameCount, TARGET_SAMPLE_RATE);
		const source = target.createBufferSource();
		source.buffer = decoded;
		source.connect(target.destination);
		source.start();
		const rendered = await target.startRendering();

		return rendered.getChannelData(0);
	} catch (cause) {
		throw new AudioExtractionError('RESAMPLE', cause);
	}
}
