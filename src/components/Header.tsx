/**
 * 시안은 헤더 아래에 선을 긋지 않고 여백으로만 본문과 가른다. 선을 그으면 화면마다 흰 카드가
 * 두 조각으로 보인다.
 */
export function Header() {
	return (
		<header className="flex h-18 shrink-0 items-center gap-4 px-10">
			<img src={`${import.meta.env.BASE_URL}logo.png`} alt="말글" className="block h-7 w-auto" />
			<span className="rounded-pill bg-surface px-3.5 py-1.5 text-timestamp font-medium text-text-sub">
				영상은 이 브라우저 밖으로 나가지 않습니다
			</span>
		</header>
	);
}
