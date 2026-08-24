export function UnsupportedBrowserPage() {
	return (
		<>
			<h1 className="text-title">이 브라우저에서는 쓸 수 없습니다</h1>
			<p className="mt-2 text-lead text-text-sub">데스크톱 Chrome이나 Edge 최신 버전으로 열어 주세요</p>
			<p className="mt-6 text-body">
				영상을 서버에 올리지 않고 브라우저 안에서만 처리하는 방식이라 이 브라우저들이 필요합니다
			</p>
		</>
	);
}
