import type { ReactNode } from 'react';

/**
 * 보조 버튼은 놓이는 면에 따라 바탕이 뒤집힌다. 흰 카드 위에서는 surface, surface 카드 위에서는 흰색이다.
 * 같은 바탕에 같은 바탕을 얹으면 버튼이 면과 구별되지 않는다.
 */
type ButtonVariant = 'primary' | 'secondary' | 'secondaryOnSurface';

/** 도구 막대는 버튼이 다섯 개 한 줄에 들어가야 해서 반경과 여백이 작다 */
type ButtonSize = 'default' | 'small';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
	primary: 'bg-brand text-bg font-semibold enabled:hover:bg-brand-strong enabled:active:bg-brand-strong',
	secondary: 'bg-surface text-text font-medium enabled:hover:bg-border enabled:active:bg-border',
	secondaryOnSurface: 'bg-bg text-text font-medium enabled:hover:bg-border enabled:active:bg-border'
};

const SIZE_CLASS: Record<ButtonSize, string> = {
	default: 'rounded-button px-7 py-3.5 text-body',
	small: 'rounded-row px-4 py-3 text-sub'
};

const PRIMARY_SIZE_CLASS: Record<ButtonSize, string> = {
	default: 'rounded-button px-7 py-3.5 text-body',
	small: 'rounded-row px-5 py-3 text-[15px]'
};

const BASE_CLASS = 'cursor-pointer transition-colors disabled:cursor-default disabled:opacity-45';

interface ButtonProps {
	variant: ButtonVariant;
	size?: ButtonSize;
	children: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	/** 라벨만으로 무엇을 하는 버튼인지 드러나지 않을 때 낭독기가 읽을 말 */
	ariaLabel?: string;
	/** 확인 화면의 주 버튼처럼 남은 폭을 다 쓰는 자리 */
	grow?: boolean;
}

export function Button({ variant, size = 'default', children, onClick, disabled, ariaLabel, grow }: ButtonProps) {
	const sizeClass = variant === 'primary' ? PRIMARY_SIZE_CLASS[size] : SIZE_CLASS[size];

	return (
		<button
			type="button"
			aria-label={ariaLabel}
			className={`${BASE_CLASS} ${sizeClass} ${VARIANT_CLASS[variant]} ${grow ? 'flex-1' : ''}`}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
