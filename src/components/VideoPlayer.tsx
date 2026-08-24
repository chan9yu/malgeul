import type { RefObject } from 'react';

interface VideoPlayerProps {
	ref: RefObject<HTMLVideoElement | null>;
	src: string;
	onTimeUpdate: (currentSeconds: number) => void;
}

/**
 * 바탕을 text 색으로 둔다. 영상이 16:9 가 아니면 남는 자리가 생기는데 흰 바탕이면 그 자리가
 * 페이지처럼 보여 영상 테두리가 사라진다.
 */
export function VideoPlayer({ ref, src, onTimeUpdate }: VideoPlayerProps) {
	return (
		<video
			ref={ref}
			src={src}
			controls
			className="aspect-video w-full rounded-card bg-text"
			onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
		/>
	);
}
