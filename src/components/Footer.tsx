const REPOSITORY_URL = 'https://github.com/chan9yu/malgeul';

export function Footer() {
	return (
		<footer className="shrink-0 border-t border-border">
			<div className="mx-auto flex max-w-content items-center gap-2 px-4 py-2 text-sub text-text-sub">
				<span>만든 사람 chan9yu</span>
				<a className="text-brand hover:text-brand-strong" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
					저장소
				</a>
			</div>
		</footer>
	);
}
