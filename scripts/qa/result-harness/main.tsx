// 결과 화면만 떼어 실제 Chrome 에 올린다. 파이프라인을 태우면 구간 수와 영상 길이를 고를 수 없어
// 빈 목록과 수백 행, 1시간 넘는 영상을 확인할 방법이 없다. 구간을 직접 만들어 넣는다.
// 이 파일은 검증용이라 배포 산출물에 들어가지 않는다. 진입점이 index.html 로 따로 있다.
import '../../../src/styles/index.css';

import { createRoot } from 'react-dom/client';

import { ResultPage } from '../../../src/pages/ResultPage';
import type { Transcript, TranscriptSegment } from '../../../src/services';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') ?? 'basic';
const videoPath = params.get('video') ?? '/_workspace/fixtures/korean-short.mp4';
const segmentCount = Number(params.get('count') ?? '6');
const durationOverride = params.get('duration');

const SENTENCES = [
	'지난주에 이야기한 일정부터 확인하겠습니다.',
	'배포는 목요일로 잡는 것이 좋겠습니다.',
	'그 전에 회귀 검사를 한 번 더 돌려야 합니다.',
	'디자인 쪽 확인은 수요일까지 받기로 했습니다.',
	'남은 것은 문구 정리뿐입니다.',
	'그러면 오늘은 여기까지 하겠습니다.'
];

async function loadVideoFile() {
	const response = await fetch(videoPath);
	const blob = await response.blob();

	return new File([blob], 'meeting.mp4', { type: 'video/mp4' });
}

function readDuration(file: File) {
	return new Promise<number>((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const probe = document.createElement('video');

		probe.preload = 'metadata';
		probe.onloadedmetadata = () => {
			URL.revokeObjectURL(url);
			resolve(probe.duration);
		};
		probe.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('영상 길이를 읽지 못했다'));
		};
		probe.src = url;
	});
}

// 구간을 영상 길이 안에 고르게 편다. 마지막 구간은 영상 끝보다 앞에서 끝나 위쪽 경계가 없는 자리를 만든다
function buildSegments(count: number, videoSeconds: number): TranscriptSegment[] {
	if (count === 0) {
		return [];
	}

	const usable = videoSeconds * 0.8;
	const step = usable / count;
	const lead = videoSeconds * 0.1;

	return Array.from({ length: count }, (_, index) => {
		const startSeconds = lead + index * step;

		return {
			startSeconds,
			endSeconds: startSeconds + step * 0.9,
			text: `${index + 1}. ${SENTENCES[index % SENTENCES.length]}`
		};
	});
}

const file = await loadVideoFile();
const videoSeconds = await readDuration(file);
const count = scenario === 'empty' ? 0 : scenario === 'many' ? segmentCount : Math.min(segmentCount, SENTENCES.length);

const transcript: Transcript = {
	segments: buildSegments(count, videoSeconds),
	durationSeconds: durationOverride === null ? videoSeconds : Number(durationOverride)
};

const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('root 를 찾지 못했다');
}

// 검증 스크립트가 화면과 대조할 값. 화면에서 읽어낸 것과 이 값을 견준다
Object.assign(window, {
	qaFixture: {
		scenario,
		videoSeconds,
		transcript
	}
});

createRoot(rootElement).render(
	<div className="mx-auto w-full max-w-content px-4 py-5">
		<ResultPage
			accepted={{ file, durationSeconds: videoSeconds }}
			transcript={transcript}
			onNewVideo={() => Object.assign(window, { qaNewVideoClicked: true })}
		/>
	</div>
);
