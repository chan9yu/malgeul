import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { ScreenHeading } from '../components/ScreenHeading';
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
		<>
			<ScreenHeading title="이 영상을 변환할까요?" subtitle="시작하면 모든 처리가 이 브라우저 안에서 진행됩니다" />

			<div className="rounded-card bg-surface p-7">
				<div className="flex items-center gap-4">
					<span className="flex size-12 shrink-0 items-center justify-center rounded-button bg-brand-soft">
						<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
							<rect x="2" y="4" width="18" height="14" rx="3" fill="var(--color-brand)" />
							<path d="M9.5 8.5 L14 11 L9.5 13.5 Z" fill="var(--color-brand-soft)" />
						</svg>
					</span>
					<div>
						<p className="text-item font-bold">{accepted.file.name}</p>
						<p className="text-item text-text-sub">
							{formatFileSize(accepted.file.size)}, {formatTimecode(accepted.durationSeconds, accepted.durationSeconds)}
						</p>
					</div>
				</div>

				<div className="mt-5">
					<Callout tone="info" plain>
						긴 영상은 기기 성능에 따라 몇 분 이상 걸릴 수 있습니다
						{modelCached === false && ' 첫 사용이라 음성 인식 모델 약 600MB를 내려받는 것이 먼저 진행됩니다'}
					</Callout>
				</div>

				<div className="mt-6 flex gap-3">
					<Button variant="primary" grow onClick={onStart}>
						변환 시작
					</Button>
					<Button variant="secondaryOnSurface" onClick={onPickAnother}>
						다른 파일 선택
					</Button>
				</div>
			</div>
		</>
	);
}
