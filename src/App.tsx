import { useEffect, useReducer, useState } from 'react';

import { AppFrame } from './components/AppFrame';
import { useWebGpuSupport } from './hooks/useWebGpuSupport';
import { ConfirmPage } from './pages/ConfirmPage';
import { FailurePage } from './pages/FailurePage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultPage } from './pages/ResultPage';
import { UnsupportedBrowserPage } from './pages/UnsupportedBrowserPage';
import { UploadPage } from './pages/UploadPage';
import type { PipelineProgress } from './services';
import { isModelCached, transcribeVideo } from './services';
import { createInitialAppState, reduceApp } from './store/app.state';
import { toFailureCode } from './utils/failure';
import { checkPickedFiles } from './utils/upload.validation';

const CONVERSION_START_PROGRESS: PipelineProgress = {
	kind: 'percent',
	stage: 'model',
	percent: 0
};

export function App() {
	const webGpuSupported = useWebGpuSupport();
	const [state, dispatch] = useReducer(reduceApp, webGpuSupported, createInitialAppState);
	const [progress, setProgress] = useState<PipelineProgress>(CONVERSION_START_PROGRESS);
	const [modelCached, setModelCached] = useState<boolean | null>(null);

	useEffect(() => {
		if (state.name !== 'upload') {
			return;
		}

		let watching = true;

		void isModelCached().then((cached) => {
			if (watching) {
				setModelCached(cached);
			}
		});

		return () => {
			watching = false;
		};
	}, [state.name]);

	const handleFilesPicked = (files: readonly File[]) => {
		void checkPickedFiles(files).then((result) => {
			if (result.kind === 'accepted') {
				dispatch({ type: 'FILE_ACCEPTED', accepted: result.accepted });
				return;
			}

			if (result.kind === 'rejected') {
				dispatch({ type: 'FILE_REJECTED', rejection: result.rejection });
			}
		});
	};

	/** 변환이 끝난 것은 모델이 저장됐다는 뜻이다. 업로드로 돌아갔을 때 첫 사용 안내문이 잠깐 남지 않게 미리 적어 둔다 */
	const runConversion = async (file: File) => {
		try {
			const transcript = await transcribeVideo(file, setProgress);
			setModelCached(true);
			dispatch({ type: 'CONVERSION_SUCCEEDED', transcript });
		} catch (cause) {
			dispatch({ type: 'CONVERSION_FAILED', failure: toFailureCode(cause) });
		}
	};

	const handleConversionStart = () => {
		if (state.name !== 'confirm') {
			return;
		}

		setProgress(CONVERSION_START_PROGRESS);
		dispatch({ type: 'CONVERSION_REQUESTED' });
		void runConversion(state.accepted.file);
	};

	const renderPage = () => {
		switch (state.name) {
			case 'unsupported':
				return <UnsupportedBrowserPage />;

			case 'upload':
				return <UploadPage rejection={state.rejection} modelCached={modelCached} onFilesPicked={handleFilesPicked} />;

			case 'confirm':
				return (
					<ConfirmPage
						accepted={state.accepted}
						modelCached={modelCached}
						onStart={handleConversionStart}
						onPickAnother={() => dispatch({ type: 'ANOTHER_FILE_REQUESTED' })}
					/>
				);

			case 'converting':
				return <ProgressPage fileName={state.accepted.file.name} progress={progress} />;

			case 'result':
				return (
					<ResultPage
						accepted={state.accepted}
						transcript={state.transcript}
						onNewVideo={() => dispatch({ type: 'NEW_VIDEO_REQUESTED' })}
					/>
				);

			case 'failure':
				return (
					<FailurePage failure={state.failure} onPickAnother={() => dispatch({ type: 'ANOTHER_FILE_REQUESTED' })} />
				);
		}
	};

	return <AppFrame wide={state.name === 'result'}>{renderPage()}</AppFrame>;
}
