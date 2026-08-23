import { useEffect, useRef, useState } from 'react';

function carriesFiles(event: DragEvent) {
	return event.dataTransfer?.types.includes('Files') === true;
}

/** 창 어디에 놓아도 파일을 받는다. 업로드 영역을 정확히 겨냥하지 않아도 되게 하려는 것이다 */
export function useWindowFileDrag(onFilesDropped: (files: readonly File[]) => void) {
	const [dragging, setDragging] = useState(false);
	const depthRef = useRef(0);

	useEffect(() => {
		const handleEnter = (event: DragEvent) => {
			if (!carriesFiles(event)) {
				return;
			}

			depthRef.current += 1;
			setDragging(true);
		};

		const handleLeave = (event: DragEvent) => {
			if (!carriesFiles(event)) {
				return;
			}

			depthRef.current = Math.max(0, depthRef.current - 1);

			if (depthRef.current === 0) {
				setDragging(false);
			}
		};

		const handleOver = (event: DragEvent) => {
			event.preventDefault();
		};

		const handleDrop = (event: DragEvent) => {
			event.preventDefault();
			depthRef.current = 0;
			setDragging(false);

			const dropped = event.dataTransfer?.files;
			onFilesDropped(dropped ? Array.from(dropped) : []);
		};

		window.addEventListener('dragenter', handleEnter);
		window.addEventListener('dragleave', handleLeave);
		window.addEventListener('dragover', handleOver);
		window.addEventListener('drop', handleDrop);

		return () => {
			window.removeEventListener('dragenter', handleEnter);
			window.removeEventListener('dragleave', handleLeave);
			window.removeEventListener('dragover', handleOver);
			window.removeEventListener('drop', handleDrop);
		};
	}, [onFilesDropped]);

	return dragging;
}
