import { mixChannelsToMono } from './audio.downmix';
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

	const pcm = renderMonoPcm(decoded);

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

/** decodeAudioData가 이미 16kHz로 리샘플링해 두므로 남은 일은 다운믹스뿐이다 */
function renderMonoPcm(decoded: AudioBuffer) {
	const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));

	try {
		return mixChannelsToMono(channels);
	} catch (cause) {
		throw new AudioExtractionError('RESAMPLE', cause);
	}
}
