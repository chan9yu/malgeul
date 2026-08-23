import { CenterColumn } from '../components/CenterColumn';
import { ProgressIndicator } from '../components/ProgressIndicator';
import type { PipelineProgress } from '../services';

interface ProgressPageProps {
	fileName: string;
	progress: PipelineProgress;
}

export function ProgressPage({ fileName, progress }: ProgressPageProps) {
	return (
		<CenterColumn>
			<p className="text-sub text-text-sub">{fileName}</p>
			<ProgressIndicator progress={progress} />
		</CenterColumn>
	);
}
