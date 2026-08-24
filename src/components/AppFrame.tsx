import type { ReactNode } from 'react';

import { useBlockWindowFileDrop } from '../hooks/useBlockWindowFileDrop';
import { Footer } from './Footer';
import { Header } from './Header';

interface AppFrameProps {
	/**
	 * 결과 화면만 콘텐츠 폭을 다 쓰고 여백도 좁다. 그리고 화면 높이에 가둔다.
	 * 창이 스크롤되면 헤더와 플레이어가 밀려 올라가 문장을 눌러도 영상이 보이지 않는다.
	 */
	wide?: boolean;
	children: ReactNode;
}

export function AppFrame({ wide, children }: AppFrameProps) {
	useBlockWindowFileDrop();

	return (
		<div className={`flex flex-col ${wide ? 'h-full overflow-hidden' : 'min-h-full'}`}>
			<Header />
			<main
				className={`mx-auto w-full flex-1 px-8 ${wide ? 'min-h-0 max-w-content pt-10 pb-16' : 'max-w-column pt-18 pb-28'}`}
			>
				{children}
			</main>
			<Footer />
		</div>
	);
}
