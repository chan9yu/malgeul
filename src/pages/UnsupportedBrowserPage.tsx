import { CenterColumn } from '../components/CenterColumn';

export function UnsupportedBrowserPage() {
	return (
		<CenterColumn>
			<h1 className="text-title">이 브라우저에서는 쓸 수 없습니다</h1>
			<div className="flex flex-col gap-1">
				<p className="text-body">데스크톱 Chrome이나 Edge 최신 버전으로 열어 주세요</p>
				<p className="text-body text-text-sub">
					영상을 서버에 올리지 않고 브라우저 안에서만 처리하는 방식이라 이 브라우저들이 필요합니다
				</p>
			</div>
		</CenterColumn>
	);
}
