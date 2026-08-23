export function Header() {
	return (
		<header className="h-8 shrink-0 border-b border-border">
			<div className="mx-auto flex h-full max-w-content items-center gap-2 px-4">
				<span className="text-section text-brand">말글</span>
				<span className="text-sub text-text-sub">영상은 이 브라우저 밖으로 나가지 않습니다</span>
			</div>
		</header>
	);
}
