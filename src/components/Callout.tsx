import type { ReactNode } from 'react';

type CalloutTone = 'info' | 'error';

const TONE_CLASS: Record<CalloutTone, string> = {
	info: 'bg-brand-soft text-text',
	error: 'bg-danger-soft text-danger'
};

interface CalloutProps {
	tone: CalloutTone;
	children: ReactNode;
}

export function Callout({ tone, children }: CalloutProps) {
	return (
		<div className={`rounded-box px-3 py-2 text-sub ${TONE_CLASS[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
			{children}
		</div>
	);
}
