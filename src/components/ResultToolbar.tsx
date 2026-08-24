import type { ExportFormat } from '../services';
import { Button } from './Button';

export type CopyNotice = 'idle' | 'copied' | 'failed';

const COPY_LABEL: Record<CopyNotice, string> = {
	idle: '전체 복사',
	copied: '복사했습니다',
	failed: '복사하지 못했습니다'
};

const DOWNLOAD_FORMATS: readonly ExportFormat[] = ['txt', 'srt', 'vtt'];

interface ResultToolbarProps {
	copyNotice: CopyNotice;
	exportDisabled: boolean;
	onCopyAll: () => void;
	onDownload: (format: ExportFormat) => void;
	onNewVideo: () => void;
}

export function ResultToolbar({ copyNotice, exportDisabled, onCopyAll, onDownload, onNewVideo }: ResultToolbarProps) {
	return (
		<div className="flex shrink-0 items-center gap-2 pb-5">
			<Button variant="primary" size="small" disabled={exportDisabled} onClick={onCopyAll}>
				<span className="grid">
					{Object.entries(COPY_LABEL).map(([notice, label]) => (
						<span key={notice} className={`col-start-1 row-start-1 ${notice === copyNotice ? '' : 'invisible'}`}>
							{label}
						</span>
					))}
				</span>
			</Button>

			{DOWNLOAD_FORMATS.map((format) => (
				<Button
					key={format}
					variant="secondary"
					size="small"
					disabled={exportDisabled}
					ariaLabel={`${format} 내려받기`}
					onClick={() => onDownload(format)}
				>
					{format}
				</Button>
			))}

			<div className="ml-auto">
				<Button variant="secondary" size="small" onClick={onNewVideo}>
					새 영상 변환
				</Button>
			</div>
		</div>
	);
}
