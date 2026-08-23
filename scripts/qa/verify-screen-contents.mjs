// 화면마다 어떤 문구가 실제로 그려지는지 확인한다.
// 문자열이 저장소에 있는지만 보는 검사는 컴포넌트로 빼는 순간 배치를 보증하지 못한다.
// 그래서 페이지가 부르는 컴포넌트를 따라 들어가 그 화면이 내놓는 문구를 모은다.
// DESIGN-SPEC 이 "빠진다" 고 적은 문구가 들어와 있는지도 함께 본다.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createChecklist } from './checklist.mjs';

const read = (p) => readFileSync(p, 'utf8');

const sourceFiles = readdirSync('src', { recursive: true })
	.map((entry) => join('src', entry))
	.filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
const textOf = new Map(sourceFiles.map((f) => [resolve(f), read(f)]));

// 이 파일이 부르는 지역 컴포넌트의 파일 경로를 돌려준다.
// JSX 로 그려지는 태그 이름만 모아 그 이름의 import 를 따라간다.
function localChildren(filePath) {
	const text = textOf.get(filePath) ?? '';
	const rendered = new Set([...text.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]));
	const children = [];

	for (const name of rendered) {
		// import { Name } from './x' 또는 '../x'
		const pattern = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'(\\.[^']+)'`);
		const hit = pattern.exec(text);
		if (!hit) continue;

		const base = resolve(dirname(filePath), hit[1]);
		for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
			if (textOf.has(resolve(candidate))) {
				children.push(resolve(candidate));
				break;
			}
		}
	}

	return children;
}

// 화면 하나가 닿는 파일 전부. 순환을 막으려고 본 것을 기억한다
function reachableFrom(entry) {
	const seen = new Set();
	const stack = [resolve(entry)];

	while (stack.length > 0) {
		const current = stack.pop();
		if (seen.has(current)) continue;
		seen.add(current);
		stack.push(...localChildren(current));
	}

	return seen;
}

// DESIGN-SPEC 이 각 화면에 놓으라고 적은 문구와 빼라고 적은 문구
const SCREENS = [
	{
		name: '업로드 화면',
		entry: 'src/pages/UploadPage.tsx',
		must: [
			'영상을 텍스트로',
			'mp4와 mov 영상 속 한국어 음성을 이 브라우저 안에서 텍스트로 바꿉니다',
			'영상 파일을 여기에 끌어다 놓거나',
			'파일 선택',
			'mp4, mov 파일 하나. 최대 2GB, 최대 2시간',
			'첫 변환 때 음성 인식 모델 약 600MB를 내려받습니다. 다음부터는 저장된 모델로 바로 시작합니다'
		],
		mustNot: []
	},
	{
		name: '변환 확인 화면',
		entry: 'src/pages/ConfirmPage.tsx',
		must: [
			'영상을 텍스트로',
			'mp4와 mov 영상 속 한국어 음성을 이 브라우저 안에서 텍스트로 바꿉니다',
			'긴 영상은 기기 성능에 따라 몇 분 이상 걸릴 수 있습니다',
			' 첫 사용이라 음성 인식 모델 약 600MB를 내려받는 것이 먼저 진행됩니다',
			'변환 시작',
			'다른 파일 선택'
		],
		// "제한 안내와 첫 사용 안내문은 ... 이 화면에서는 빠진다"
		mustNot: ['mp4, mov 파일 하나. 최대 2GB, 최대 2시간', '첫 변환 때 음성 인식 모델 약 600MB를 내려받습니다']
	},
	{
		name: '변환 진행 화면',
		entry: 'src/pages/ProgressPage.tsx',
		must: ['모델 준비', '음성 추출', '변환'],
		// "중단 버튼은 두지 않는다"
		mustNot: ['중단', '다른 파일 선택', '변환 시작']
	},
	{
		name: '결과 화면',
		entry: 'src/pages/ResultPage.tsx',
		must: [
			'전체 복사',
			'복사했습니다',
			'복사하지 못했습니다',
			'새 영상 변환',
			// 내려받기 라벨 셋과 낭독기가 읽을 뒷말
			"'txt'",
			"'srt'",
			"'vtt'",
			'내려받기',
			'이 영상에서 문장을 찾지 못했습니다. 음성이 없거나 너무 작을 수 있습니다'
		],
		// 결과 화면에는 업로드와 확인 화면의 동선이 없다
		mustNot: ['변환 시작', '다른 파일 선택', '영상 파일을 여기에 끌어다 놓거나']
	},
	{
		name: '실패 안내 화면',
		entry: 'src/pages/FailurePage.tsx',
		must: ['다른 파일 선택'],
		mustNot: ['영상 파일을 여기에 끌어다 놓거나']
	},
	{
		name: '비지원 브라우저 안내',
		entry: 'src/pages/UnsupportedBrowserPage.tsx',
		must: [
			'이 브라우저에서는 쓸 수 없습니다',
			'데스크톱 Chrome이나 Edge 최신 버전으로 열어 주세요',
			'영상을 서버에 올리지 않고 브라우저 안에서만 처리하는 방식이라 이 브라우저들이 필요합니다'
		],
		// "업로드 영역을 비롯한 다른 요소는 보여주지 않는다"
		mustNot: ['영상 파일을 여기에 끌어다 놓거나', '파일 선택', '변환 시작']
	}
];

const { check, report } = createChecklist();

for (const screen of SCREENS) {
	const reachable = reachableFrom(screen.entry);
	const text = [...reachable].map((f) => textOf.get(f) ?? '').join('\n');
	const group = `${screen.name}  닿는 파일 ${reachable.size}개`;

	for (const phrase of screen.must) {
		check(group, `놓인다: ${phrase}`, text.includes(phrase));
	}
	for (const phrase of screen.mustNot) {
		check(group, `빠진다: ${phrase}`, !text.includes(phrase));
	}
}

process.exit(report() > 0 ? 1 : 0);
