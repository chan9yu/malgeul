const HEADER_BYTE_LENGTH = 44;
const RIFF_CHUNK_HEADER_BYTE_LENGTH = 8;
const FMT_CHUNK_BODY_BYTE_LENGTH = 16;
const PCM_FORMAT_TAG = 1;
const CHANNEL_COUNT = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const INT16_MAX = 0x7fff;
const INT16_MIN_MAGNITUDE = 0x8000;
const LITTLE_ENDIAN = true;

export function encodeWav(pcm: Float32Array, sampleRate: number) {
	const dataByteLength = pcm.length * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(HEADER_BYTE_LENGTH + dataByteLength);
	const view = new DataView(buffer);

	const header = createHeaderWriter(view);
	header.ascii('RIFF');
	header.uint32(HEADER_BYTE_LENGTH - RIFF_CHUNK_HEADER_BYTE_LENGTH + dataByteLength);
	header.ascii('WAVE');
	header.ascii('fmt ');
	header.uint32(FMT_CHUNK_BODY_BYTE_LENGTH);
	header.uint16(PCM_FORMAT_TAG);
	header.uint16(CHANNEL_COUNT);
	header.uint32(sampleRate);
	header.uint32(sampleRate * CHANNEL_COUNT * BYTES_PER_SAMPLE);
	header.uint16(CHANNEL_COUNT * BYTES_PER_SAMPLE);
	header.uint16(BITS_PER_SAMPLE);
	header.ascii('data');
	header.uint32(dataByteLength);

	writeSamples(view, pcm);

	return new Blob([buffer], { type: 'audio/wav' });
}

function createHeaderWriter(view: DataView) {
	let offset = 0;

	return {
		ascii(text: string) {
			for (const character of text) {
				view.setUint8(offset, character.charCodeAt(0));
				offset += Uint8Array.BYTES_PER_ELEMENT;
			}
		},
		uint16(value: number) {
			view.setUint16(offset, value, LITTLE_ENDIAN);
			offset += Uint16Array.BYTES_PER_ELEMENT;
		},
		uint32(value: number) {
			view.setUint32(offset, value, LITTLE_ENDIAN);
			offset += Uint32Array.BYTES_PER_ELEMENT;
		}
	};
}

function writeSamples(view: DataView, pcm: Float32Array) {
	for (let index = 0; index < pcm.length; index += 1) {
		const clamped = Math.max(-1, Math.min(1, pcm[index]));
		const scaled = clamped < 0 ? clamped * INT16_MIN_MAGNITUDE : clamped * INT16_MAX;
		view.setInt16(HEADER_BYTE_LENGTH + index * BYTES_PER_SAMPLE, Math.round(scaled), LITTLE_ENDIAN);
	}
}
