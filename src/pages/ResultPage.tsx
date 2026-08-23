import { Button } from '../components/Button';
import { CenterColumn } from '../components/CenterColumn';
import type { Transcript } from '../services';

interface ResultPageProps {
	transcript: Transcript;
	onNewVideo: () => void;
}

export function ResultPage({ transcript, onNewVideo }: ResultPageProps) {
	return (
		<CenterColumn>
			<p className="text-body">변환된 문장 {transcript.segments.length}개</p>
			<div className="flex">
				<Button variant="secondary" onClick={onNewVideo}>
					새 영상 변환
				</Button>
			</div>
		</CenterColumn>
	);
}
