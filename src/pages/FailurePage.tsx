import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { ScreenHeading } from '../components/ScreenHeading';
import type { PipelineFailure } from '../services';
import { FAILURE_MESSAGE } from '../utils/failure';

interface FailurePageProps {
	failure: PipelineFailure;
	onPickAnother: () => void;
}

export function FailurePage({ failure, onPickAnother }: FailurePageProps) {
	return (
		<>
			<ScreenHeading title="변환하지 못했어요" />

			<Callout tone="error">{FAILURE_MESSAGE[failure]}</Callout>

			<div className="mt-8 flex">
				<Button variant="primary" onClick={onPickAnother}>
					다른 파일 선택
				</Button>
			</div>
		</>
	);
}
