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
		<ul className="flex flex-col gap-0.5">
			{segments.map((segment, index) => {
				const playing = index === playingIndex;

				return (
					<li key={index}>
						<button
							type="button"
							aria-current={playing || undefined}
							className={`flex w-full cursor-pointer gap-4 rounded-row px-4 py-2.5 text-left transition-colors ${
								playing ? 'bg-brand-soft' : 'hover:bg-surface'
							}`}
							onClick={() => onSelect(index)}
						>
							<span
								className={`w-20 shrink-0 text-timestamp tabular-nums ${playing ? 'text-brand-strong' : 'text-text-sub'}`}
							>
								{formatTimecode(segment.startSeconds, durationSeconds)}
							</span>
							<span className={`text-body ${playing ? 'font-medium' : ''}`}>{segment.text}</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
