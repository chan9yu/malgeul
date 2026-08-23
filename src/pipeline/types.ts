/** 화면 문구는 이 코드로 고른다. AudioExtractionError의 message는 개발자용이라 그대로 보여주지 않는다 */
export type AudioExtractionFailure =
	| 'FILE_READ' // 고른 뒤 파일이 옮겨지거나 지워져 읽지 못했다
	| 'DECODE' // 오디오 트랙이 없거나 내장 디코더가 해독하지 못했다
	| 'EMPTY_AUDIO' // 오디오 트랙을 해독했으나 길이가 0이다
	| 'RESAMPLE'; // 16kHz 모노 렌더링이 실패했다. 대개 메모리가 모자란 경우다

export interface ExtractedAudio {
	/** 16kHz 모노 PCM. 음성 인식이 그대로 받는 입력이다 */
	pcm: Float32Array<ArrayBuffer>;
	/** 항상 16000 */
	sampleRate: number;
	durationSeconds: number;
}
