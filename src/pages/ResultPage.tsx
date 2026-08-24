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
import { formatTimecode } from '../utils/timecode';
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
	const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (noticeTimerRef.current !== null) {
				clearTimeout(noticeTimerRef.current);
			}
		};
	}, []);

	const showCopyNotice = (notice: CopyNotice) => {
		if (noticeTimerRef.current !== null) {
			clearTimeout(noticeTimerRef.current);
		}

		setCopyNotice(notice);
		noticeTimerRef.current = setTimeout(() => setCopyNotice('idle'), COPY_NOTICE_MS);
	};

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
			showCopyNotice('copied');
		} catch {
			showCopyNotice('failed');
		}
	};

	const handleCopyAll = () => {
		void copyAll();
	};

	const handleDownload = (format: ExportFormat) => {
		downloadTranscript(transcript, accepted.file.name, format);
	};

	return (
		<div className="flex h-full items-start gap-8">
			<div className="w-[45%] min-w-[420px] shrink-0">
				<VideoPlayer ref={videoRef} src={videoUrl} onTimeUpdate={handleTimeUpdate} />
				<div className="mt-3 flex items-baseline gap-2 px-1">
					<p className="truncate text-sub font-semibold">{accepted.file.name}</p>
					<p className="shrink-0 text-timestamp font-medium tabular-nums text-text-sub">
						{formatTimecode(transcript.durationSeconds, transcript.durationSeconds)}
					</p>
				</div>
			</div>

			<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
				<ResultToolbar
					copyNotice={copyNotice}
					exportDisabled={!hasSentences}
					onCopyAll={handleCopyAll}
					onDownload={handleDownload}
					onNewVideo={onNewVideo}
				/>
				{hasSentences ? (
					<div className="min-h-0 flex-1 overflow-y-auto">
						<SentenceList
							segments={transcript.segments}
							durationSeconds={transcript.durationSeconds}
							playingIndex={playingIndex}
							onSelect={handleSelect}
						/>
					</div>
				) : (
					<div className="mt-3">
						<Callout tone="info">{NO_SENTENCE_NOTICE}</Callout>
					</div>
				)}
			</div>
		</div>
	);
}
