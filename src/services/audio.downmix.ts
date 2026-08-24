/**
 * 채널을 평균 내어 하나로 합친다.
 *
 * Web Audio 의 destination 에 연결해 맡기지 않는 이유는 채널 수가 1, 2, 4, 6 일 때만 다운믹스 규칙이
 * 정해져 있어서다. 그 밖의 채널 수는 discrete 로 취급해 앞에서부터 필요한 만큼만 남기고 버린다.
 * 8채널 화면 녹화처럼 첫 채널이 비어 있고 다른 채널에 목소리가 있으면 결과가 통째로 무음이 된다.
 *
 * 모노여도 새 배열에 옮긴다. AudioBuffer 가 들고 있는 버퍼를 그대로 돌려주면 워커로 transfer 할 때
 * 남의 버퍼를 detach 하게 된다.
 */
export function mixChannelsToMono(channels: readonly Float32Array[]): Float32Array<ArrayBuffer> {
	if (channels.length === 0) {
		return new Float32Array(0);
	}

	const frameCount = channels[0].length;
	const mono = new Float32Array(frameCount);

	for (const channel of channels) {
		for (let frame = 0; frame < frameCount; frame += 1) {
			mono[frame] += channel[frame];
		}
	}

	const scale = 1 / channels.length;
	for (let frame = 0; frame < frameCount; frame += 1) {
		mono[frame] *= scale;
	}

	return mono;
}
