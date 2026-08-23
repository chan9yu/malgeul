import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { CenterColumn } from '../components/CenterColumn';
import { formatFileSize } from '../utils/file-size';
import { formatTimecode } from '../utils/timecode';
import type { AcceptedFile } from '../utils/upload.validation';

interface ConfirmPageProps {
	accepted: AcceptedFile;
	modelCached: boolean | null;
	onStart: () => void;
	onPickAnother: () => void;
}

export function ConfirmPage({ accepted, modelCached, onStart, onPickAnother }: ConfirmPageProps) {
	return (
		<CenterColumn>
			<h1 className="text-title">영상을 텍스트로</h1>

			<div className="flex flex-col gap-1 rounded-box border border-border bg-surface px-3 py-2">
				<p className="text-body">{accepted.file.name}</p>
				<p className="text-body text-text-sub">크기 {formatFileSize(accepted.file.size)}</p>
				<p className="text-body text-text-sub">길이 {formatTimecode(accepted.durationSeconds)}</p>
			</div>

			<Callout tone="info">
				긴 영상은 기기 성능에 따라 몇 분 이상 걸릴 수 있습니다
				{modelCached === false && ' 첫 사용이라 음성 인식 모델 약 600MB를 내려받는 것이 먼저 진행됩니다'}
			</Callout>

			<div className="flex items-center gap-2">
				<Button variant="primary" onClick={onStart}>
					변환 시작
				</Button>
				<Button variant="secondary" onClick={onPickAnother}>
					다른 파일 선택
				</Button>
			</div>
		</CenterColumn>
	);
}
