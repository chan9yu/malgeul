import { Callout } from '../components/Callout';
import { CenterColumn } from '../components/CenterColumn';
import { ConversionHeading } from '../components/ConversionHeading';
import { UploadArea } from '../components/UploadArea';
import { useWindowFileDrag } from '../hooks/useWindowFileDrag';
import type { UploadRejection } from '../utils/upload.validation';
import { UPLOAD_REJECTION_MESSAGE } from '../utils/upload.validation';

interface UploadPageProps {
	rejection: UploadRejection | null;
	/** null은 확인 중. 안내문을 띄웠다 지우는 깜빡임을 막으려고 확인이 끝날 때까지 감춘다 */
	modelCached: boolean | null;
	onFilesPicked: (files: readonly File[]) => void;
}

export function UploadPage({ rejection, modelCached, onFilesPicked }: UploadPageProps) {
	const dragging = useWindowFileDrag(onFilesPicked);

	return (
		<CenterColumn>
			<ConversionHeading />

			<UploadArea dragging={dragging} onFilesPicked={onFilesPicked} />

			{rejection && <Callout tone="error">{UPLOAD_REJECTION_MESSAGE[rejection]}</Callout>}

			<p className="text-sub text-text-sub">mp4, mov 파일 하나. 최대 2GB, 최대 2시간</p>

			{modelCached === false && (
				<Callout tone="info">
					첫 변환 때 음성 인식 모델 약 600MB를 내려받습니다. 다음부터는 저장된 모델로 바로 시작합니다
				</Callout>
			)}
		</CenterColumn>
	);
}
