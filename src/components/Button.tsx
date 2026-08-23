import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
	primary: 'bg-brand text-bg enabled:hover:bg-brand-strong enabled:active:bg-brand-strong',
	secondary:
		'border border-border bg-bg text-text enabled:hover:border-brand-strong enabled:hover:text-brand-strong enabled:active:border-brand-strong enabled:active:text-brand-strong'
};

const BASE_CLASS =
	'cursor-pointer rounded-box px-3 py-1 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

interface ButtonProps {
	variant: ButtonVariant;
	children: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
}

export function Button({ variant, children, onClick, disabled }: ButtonProps) {
	return (
		<button type="button" className={`${BASE_CLASS} ${VARIANT_CLASS[variant]}`} onClick={onClick} disabled={disabled}>
			{children}
		</button>
	);
}
