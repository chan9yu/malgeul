import type { PipelineProgress, PipelineStage } from '../services';
import { formatBytesProgress, PIPELINE_STAGES, toPercent } from '../services';

const STAGE_LABEL: Record<PipelineStage, string> = {
	model: '모델 준비',
	audio: '음성 추출',
	transcribe: '변환'
};

function readBarPercent(progress: PipelineProgress) {
	if (progress.kind === 'percent') {
		return progress.percent;
	}

	return toPercent(progress.loadedBytes, progress.totalBytes);
}

function readAmountLabel(progress: PipelineProgress) {
	if (progress.kind === 'bytes') {
		return formatBytesProgress(progress);
	}

	return `${Math.round(progress.percent)}%`;
}

function stageTextClass(index: number, currentIndex: number) {
	if (index === currentIndex) {
		return 'font-semibold text-text';
	}

	if (index < currentIndex) {
		return 'text-text';
	}

	return 'text-text-sub';
}

interface ProgressIndicatorProps {
	progress: PipelineProgress;
}

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
	const currentIndex = PIPELINE_STAGES.indexOf(progress.stage);

	return (
		<div className="flex flex-col gap-3">
			<ul className="flex flex-col gap-1">
				{PIPELINE_STAGES.map((stage, index) => (
					<li key={stage} className="flex items-center gap-1 text-body">
						<span className="w-2 text-brand">{index < currentIndex ? '✓' : ''}</span>
						<span className={stageTextClass(index, currentIndex)}>{STAGE_LABEL[stage]}</span>
					</li>
				))}
			</ul>

			<div className="flex items-center gap-2">
				<div className="h-1 flex-1 overflow-hidden rounded-box bg-border">
					<div
						className="h-full rounded-box bg-brand transition-[width]"
						style={{ width: `${readBarPercent(progress)}%` }}
					/>
				</div>
				<span className="w-16 text-right text-sub tabular-nums text-text-sub">{readAmountLabel(progress)}</span>
			</div>
		</div>
	);
}
