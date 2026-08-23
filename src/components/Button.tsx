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
	/** 라벨만으로 무엇을 하는 버튼인지 드러나지 않을 때 낭독기가 읽을 말 */
	ariaLabel?: string;
}

export function Button({ variant, children, onClick, disabled, ariaLabel }: ButtonProps) {
	return (
		<button
			type="button"
			aria-label={ariaLabel}
			className={`${BASE_CLASS} ${VARIANT_CLASS[variant]}`}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
