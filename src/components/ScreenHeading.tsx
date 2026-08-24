interface ScreenHeadingProps {
	title: string;
	/** 진행 화면은 파일 이름을, 실패 화면은 아무것도 놓지 않는다 */
	subtitle?: string;
}

export function ScreenHeading({ title, subtitle }: ScreenHeadingProps) {
	return (
		<div className="mb-10">
			<h1 className="text-title">{title}</h1>
			{subtitle && <p className="mt-2 text-lead text-text-sub">{subtitle}</p>}
		</div>
	);
}
