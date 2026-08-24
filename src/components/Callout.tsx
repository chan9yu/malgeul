import type { ReactNode } from 'react';

type CalloutTone = 'info' | 'error';

const TONE_CLASS: Record<CalloutTone, string> = {
	info: 'bg-brand-soft text-text',
	error: 'bg-danger-soft font-medium text-danger'
};

/**
 * 알림과 경고를 같은 20px 원으로 그리고 획의 위아래만 뒤집는다. 알림은 아래가 긴 i, 경고는 위가 긴 느낌표다.
 * 원 안쪽 획은 안내문 바탕색으로 파내 색을 두 가지만 쓴다.
 */
const ICON: Record<CalloutTone, { circle: string; cut: string; barY: number; dotY: number }> = {
	info: { circle: 'var(--color-brand)', cut: 'var(--color-brand-soft)', barY: 8.5, dotY: 6 },
	error: { circle: 'var(--color-danger)', cut: 'var(--color-danger-soft)', barY: 5, dotY: 14 }
};

interface CalloutProps {
	tone: CalloutTone;
	/** 확인 화면의 소요 시간 안내처럼 아이콘 없이 글자만 놓는 자리 */
	plain?: boolean;
	children: ReactNode;
}

export function Callout({ tone, plain, children }: CalloutProps) {
	const icon = ICON[tone];

	return (
		<div
			className={`flex items-start gap-3 rounded-callout px-5 py-4.5 text-sub ${TONE_CLASS[tone]}`}
			role={tone === 'error' ? 'alert' : undefined}
		>
			{!plain && (
				<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 shrink-0">
					<circle cx="10" cy="10" r="9" fill={icon.circle} />
					<rect x="9" y={icon.barY} width="2" height="6" rx="1" fill={icon.cut} />
					<circle cx="10" cy={icon.dotY} r="1.2" fill={icon.cut} />
				</svg>
			)}
			<div>{children}</div>
		</div>
	);
}
