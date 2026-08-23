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

/**
 * decodeAudioData가 이미 16kHz로 리샘플링해 두므로 남은 일은 다운믹스뿐이다.
 * 입력이 모노면 바꿀 것이 없어 채널을 그대로 돌려준다.
 */
async function renderMonoPcm(decoded: AudioBuffer) {
	if (decoded.numberOfChannels === TARGET_CHANNEL_COUNT) {
		return decoded.getChannelData(0);
	}

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
