import type { TranscriptSegment } from '../services';
import { formatTimecode } from '../utils/timecode';

interface SentenceListProps {
	segments: readonly TranscriptSegment[];
	durationSeconds: number;
	playingIndex: number;
	onSelect: (index: number) => void;
}

export function SentenceList({ segments, durationSeconds, playingIndex, onSelect }: SentenceListProps) {
	return (
		<ul className="flex flex-col">
			{segments.map((segment, index) => {
				const playing = index === playingIndex;

				return (
					<li key={index}>
						<button
							type="button"
							aria-current={playing || undefined}
							className={`flex w-full cursor-pointer gap-2 rounded-box px-2 py-1 text-left transition-colors ${
								playing ? 'bg-brand-soft' : 'hover:bg-surface'
							}`}
							onClick={() => onSelect(index)}
						>
							<span className="w-10 shrink-0 pt-1 text-timestamp tabular-nums text-text-sub">
								{formatTimecode(segment.startSeconds, durationSeconds)}
							</span>
							<span className="text-body">{segment.text}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
