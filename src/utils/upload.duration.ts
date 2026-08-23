/** 메타데이터를 읽지 못하면 NaN으로 resolve한다. checkDuration이 그 값을 METADATA 거절로 옮긴다 */
export function readVideoDuration(file: File) {
	return new Promise<number>((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');

		const settle = (durationSeconds: number) => {
			video.removeAttribute('src');
			URL.revokeObjectURL(url);
			resolve(durationSeconds);
		};

		video.preload = 'metadata';
		video.addEventListener('loadedmetadata', () => settle(video.duration));
		video.addEventListener('error', () => settle(Number.NaN));
		video.src = url;
	});
}
