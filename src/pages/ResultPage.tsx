import { useEffect, useRef, useState } from 'react';

import { Callout } from '../components/Callout';
import type { CopyNotice } from '../components/ResultToolbar';
import { ResultToolbar } from '../components/ResultToolbar';
import { SentenceList } from '../components/SentenceList';
import { VideoPlayer } from '../components/VideoPlayer';
import { useObjectUrl } from '../hooks/useObjectUrl';
import type { ExportFormat, Transcript } from '../services';
import { buildTxt, downloadTranscript } from '../services';
import { findPlayingSegmentIndex, NO_PLAYING_SEGMENT } from '../utils/playing-segment';
import type { AcceptedFile } from '../utils/upload.validation';

const COPY_NOTICE_MS = 2000;
const NO_SENTENCE_NOTICE = '이 영상에서 문장을 찾지 못했습니다. 음성이 없거나 너무 작을 수 있습니다';

interface ResultPageProps {
	accepted: AcceptedFile;
	transcript: Transcript;
	onNewVideo: () => void;
}

export function ResultPage({ accepted, transcript, onNewVideo }: ResultPageProps) {
	const hasSentences = transcript.segments.length > 0;
	const videoUrl = useObjectUrl(accepted.file);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [playingIndex, setPlayingIndex] = useState(NO_PLAYING_SEGMENT);
	const [copyNotice, setCopyNotice] = useState<CopyNotice>('idle');
	/** 알림이 떠 있는 동안 다시 누르면 copyNotice 값이 같아 effect가 다시 돌지 않는다. 누름마다 늘려 타이머를 새로 건다 */
	const [copyPressCount, setCopyPressCount] = useState(0);

	useEffect(() => {
		if (copyNotice === 'idle') {
			return;
		}

		const timer = setTimeout(() => setCopyNotice('idle'), COPY_NOTICE_MS);

		return () => {
			clearTimeout(timer);
		};
	}, [copyNotice, copyPressCount]);

	const handleSelect = (index: number) => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		video.currentTime = transcript.segments[index].startSeconds;
		void video.play();
	};

	const handleTimeUpdate = (currentSeconds: number) => {
		setPlayingIndex(findPlayingSegmentIndex(transcript.segments, currentSeconds));
	};

	const copyAll = async () => {
		try {
			await navigator.clipboard.writeText(buildTxt(transcript));
			setCopyNotice('copied');
		} catch {
			setCopyNotice('failed');
		}

		setCopyPressCount((count) => count + 1);
	};

	const handleCopyAll = () => {
		void copyAll();
	};

	const handleDownload = (format: ExportFormat) => {
		downloadTranscript(transcript, accepted.file.name, format);
	};

	return (
		<div className="flex items-start gap-4">
			<div className="sticky top-0 w-[45%] min-w-[420px] shrink-0 bg-bg py-2">
				<VideoPlayer ref={videoRef} src={videoUrl} onTimeUpdate={handleTimeUpdate} />
			</div>

			<div className="flex min-w-0 flex-1 flex-col">
				<ResultToolbar
					copyNotice={copyNotice}
					exportDisabled={!hasSentences}
					onCopyAll={handleCopyAll}
					onDownload={handleDownload}
					onNewVideo={onNewVideo}
				/>
				{hasSentences ? (
					<SentenceList
						segments={transcript.segments}
						durationSeconds={transcript.durationSeconds}
						playingIndex={playingIndex}
						onSelect={handleSelect}
					/>
				) : (
					<div className="pt-2">
						<Callout tone="info">{NO_SENTENCE_NOTICE}</Callout>
					</div>
				)}
			</div>
		</div>
	);
}
