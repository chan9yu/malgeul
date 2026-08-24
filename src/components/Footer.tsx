const REPOSITORY_URL = 'https://github.com/chan9yu/malgeul';

export function Footer() {
	return (
		<footer className="flex shrink-0 items-center gap-2 border-t border-border px-10 py-5 text-timestamp font-normal text-text-sub">
			<span>made by chan9yu</span>
			<span aria-hidden="true">·</span>
			<a
				className="font-medium text-brand hover:text-brand-strong hover:underline"
				href={REPOSITORY_URL}
				target="_blank"
				rel="noreferrer"
			>
				저장소
			</a>
		</footer>
	);
}
