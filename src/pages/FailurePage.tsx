import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { CenterColumn } from '../components/CenterColumn';
import type { PipelineFailure } from '../services';
import { FAILURE_MESSAGE } from '../utils/failure';

interface FailurePageProps {
	failure: PipelineFailure;
	onPickAnother: () => void;
}

export function FailurePage({ failure, onPickAnother }: FailurePageProps) {
	return (
		<CenterColumn>
			<Callout tone="error">{FAILURE_MESSAGE[failure]}</Callout>
			<div className="flex">
				<Button variant="primary" onClick={onPickAnother}>
					다른 파일 선택
				</Button>
			</div>
		</CenterColumn>
	);
}
