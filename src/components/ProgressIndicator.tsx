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

interface ProgressIndicatorProps {
	progress: PipelineProgress;
}

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
	return (
		<div className="rounded-card bg-surface p-7">
			<ul className="flex flex-col gap-4">
				{PIPELINE_STAGES.map((stage) => {
					const current = stage === progress.stage;

					return (
						<li key={stage} className="flex items-center gap-3">
							<span
								className={`size-2.5 shrink-0 rounded-pill ${current ? 'bg-brand' : 'border-2 border-border bg-bg'}`}
							/>
							<span className={`text-item ${current ? 'font-bold' : 'text-text-sub'}`}>{STAGE_LABEL[stage]}</span>
						</li>
					);
				})}
			</ul>

			<div className="mt-7 flex items-center gap-4">
				<div className="h-3 flex-1 overflow-hidden rounded-pill bg-border">
					<div
						className="h-full rounded-pill bg-brand transition-[width] duration-300"
						style={{ width: `${readBarPercent(progress)}%` }}
					/>
				</div>
				<span className="shrink-0 text-timestamp font-medium tabular-nums text-text-sub">
					{readAmountLabel(progress)}
				</span>
			</div>
		</div>
	);
}
