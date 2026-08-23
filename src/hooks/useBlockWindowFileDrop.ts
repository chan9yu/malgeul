import { useEffect } from 'react';

/**
 * 창에 떨어진 파일을 브라우저가 열지 못하게 막는다.
 * 막지 않으면 변환 중에 파일을 흘린 순간 페이지가 그 파일로 바뀌어 몇 분 걸린 변환이 사라진다.
 */
export function useBlockWindowFileDrop() {
	useEffect(() => {
		const cancel = (event: DragEvent) => {
			event.preventDefault();
		};

		window.addEventListener('dragover', cancel);
		window.addEventListener('drop', cancel);

		return () => {
			window.removeEventListener('dragover', cancel);
			window.removeEventListener('drop', cancel);
		};
	}, []);
}
