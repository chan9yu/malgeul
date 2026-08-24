import { ProgressIndicator } from '../components/ProgressIndicator';
import { ScreenHeading } from '../components/ScreenHeading';
import type { PipelineProgress } from '../services';

interface ProgressPageProps {
	fileName: string;
	progress: PipelineProgress;
}

export function ProgressPage({ fileName, progress }: ProgressPageProps) {
	return (
		<>
			<ScreenHeading title="변환하고 있어요" subtitle={fileName} />
			<ProgressIndicator progress={progress} />
		</>
	);
}
