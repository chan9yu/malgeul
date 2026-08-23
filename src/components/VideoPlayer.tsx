import type { RefObject } from 'react';

interface VideoPlayerProps {
	ref: RefObject<HTMLVideoElement | null>;
	src: string;
	onTimeUpdate: (currentSeconds: number) => void;
}

export function VideoPlayer({ ref, src, onTimeUpdate }: VideoPlayerProps) {
	return (
		<video
			ref={ref}
			src={src}
			controls
			className="aspect-video w-full rounded-box border border-border bg-surface"
			onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
		/>
	);
}
