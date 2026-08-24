// 정본 문서에서 문자열과 값을 뽑아 코드와 무가공 대조한다.
// 눈으로 훑으면 조사 한 글자와 공백 하나를 놓친다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createChecklist } from './checklist.mjs';

const read = (p) => readFileSync(p, 'utf8');

const sourceFiles = readdirSync('src', { recursive: true })
	.map((entry) => join('src', entry))
	.filter((f) => /\.(ts|tsx|css)$/.test(f));
const codeFiles = sourceFiles.filter((f) => !f.endsWith('.test.ts'));
const code = codeFiles.map((f) => ({ file: f, text: read(f) }));

const { check, report } = createChecklist();

// 코드 어딘가에 그 문자열이 있는지. 어느 파일인지도 돌려준다
function findInCode(needle) {
	const hits = code.filter((c) => c.text.includes(needle));
	return hits.map((h) => h.file);
}

// ---- 1. SPEC 거절 문구 표 ----
const spec = read('docs/product/SPEC.md');
const rejectionRows = [...spec.matchAll(/^\| (개수|확장자|크기|길이|메타데이터)\s*\| (.+?)\s*\|$/gm)];
for (const [, cause, message] of rejectionRows) {
	const files = findInCode(message);
	check('SPEC 거절 문구', `${cause}: ${message}`, files.length > 0, files.join(', '));
}
check('SPEC 거절 문구', '표의 행 수가 5', rejectionRows.length === 5, `${rejectionRows.length}행`);

// ---- 2. SPEC 실패 문구 표 ----
const failureRows = [
	...spec.matchAll(/^\| (?:음성 추출|모델 준비|변환|알 수 없음)\s*\| `([A-Z_]+)`\s*\| (.+?)\s*\|$/gm)
];
for (const [, codeName, message] of failureRows) {
	const files = findInCode(message);
	check('SPEC 실패 문구', `${codeName}: ${message}`, files.length > 0, files.join(', '));
	// 코드 이름 자체가 타입에 있는지
	check('SPEC 실패 코드', codeName, findInCode(`'${codeName}'`).length > 0);
}
check('SPEC 실패 문구', '표의 행 수가 7', failureRows.length === 7, `${failureRows.length}행`);

// ---- 3. DESIGN 색 표와 CSS 커스텀 프로퍼티 ----
const design = read('docs/design/DESIGN.md');
const css = read('src/styles/index.css');
const colorRows = [...design.matchAll(/^\|.+?\| `([a-z-]+)`\s*\| `(#[0-9a-fA-F]{6})`\s*\|$/gm)];
for (const [, name, hex] of colorRows) {
	// 무가공 대조. 대소문자 무시 없음
	const declaration = `--color-${name}: ${hex};`;
	check('DESIGN 색 표', `${name} = ${hex}`, css.includes(declaration), declaration);
	check('DESIGN 색 hex 소문자', `${name}`, hex === hex.toLowerCase(), hex);
}
check('DESIGN 색 표', '표의 행 수가 10', colorRows.length === 10, `${colorRows.length}행`);

// CSS에 표에 없는 색 토큰이 있는지 (무단 토큰)
const cssColorTokens = [...css.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]);
const documented = new Set(colorRows.map((r) => r[1]));
for (const token of cssColorTokens) {
	check('CSS 색 토큰이 문서에 있음', token, documented.has(token));
}

// ---- 4. DESIGN-SPEC과 DESIGN의 따옴표 문구 ----
// 문서는 곧은 따옴표를 쓴다. 표 안의 코드 이름은 백틱이라 걸리지 않는다
const quotedFrom = (docPath) => {
	const text = read(docPath);
	return [...text.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]);
};
const uiPhrases = new Set([...quotedFrom('docs/design/DESIGN-SPEC.md'), ...quotedFrom('docs/design/DESIGN.md')]);
// 뽑힌 것이 없으면 대조를 안 한 것이다. 조용히 통과하지 않도록 세운다
check('문서 문구 추출', '따옴표 문구를 하나라도 뽑았다', uiPhrases.size > 0, `${uiPhrases.size}건`);
for (const phrase of uiPhrases) {
	// 형식 예시는 문구가 아니다.
	// "txt 내려받기" 는 문서가 형태로 보인 것이고 코드는 형식마다 조합한다
	if (/^(312MB \/ 600MB|mm:ss|h:mm:ss|WEBVTT|txt 내려받기)$/.test(phrase)) continue;
	const files = findInCode(phrase);
	check('문서 문구가 코드에 있음', phrase, files.length > 0, files.join(', '));
}

// 조합해 만드는 라벨은 위에서 건너뛰었다. 뒷말과 형식 셋이 코드에 있는지 따로 본다.
// 실제로 그려지는 라벨 셋은 화면을 띄워 읽는 쪽에서 대조한다
check('DESIGN-SPEC 대체 라벨', '내려받기 뒷말', findInCode(' 내려받기').length > 0);
for (const format of ['txt', 'srt', 'vtt']) {
	check('DESIGN-SPEC 대체 라벨', `${format} 형식`, findInCode(`'${format}'`).length > 0);
}

// ---- 5. 타이포그래피 표와 CSS ----
const typeKey = {
	'화면 제목': 'title',
	'절 제목': 'section',
	'본문과 변환 결과 문장': 'body',
	'목록 항목': 'item',
	'머리말 설명': 'lead',
	'보조 설명': 'sub',
	타임스탬프: 'timestamp'
};
const typeRows = [
	...design.matchAll(
		new RegExp(String.raw`^\| (${Object.keys(typeKey).join('|')})\s*\| (\d+)px\s*\| (\d+)\s*\| ([\d.]+)\s*\|$`, 'gm')
	)
];
check(
	'타이포 표',
	`표의 행 수가 ${Object.keys(typeKey).length}`,
	typeRows.length === Object.keys(typeKey).length,
	`${typeRows.length}행`
);
for (const [, role, size, weight, lineHeight] of typeRows) {
	const key = typeKey[role];
	check('타이포 크기', `${key} ${size}px`, css.includes(`--text-${key}: ${size}px;`));
	check('타이포 굵기', `${key} ${weight}`, css.includes(`--text-${key}--font-weight: ${weight};`));
	// 행간 1.0은 CSS에서 1로 적힐 수 있다
	const lh = css.match(new RegExp(`--text-${key}--line-height: ([\\d.]+);`));
	check(
		'타이포 행간',
		`${key} ${lineHeight}`,
		lh !== null && Number(lh[1]) === Number(lineHeight),
		lh ? lh[1] : '없음'
	);
}

// ---- 6. SPEC 수치 ----
// 숫자를 여기에 적으면 문서를 고쳐도 검사가 옛 값을 본다. SPEC 의 검사 순서 절에서 읽는다
const sizeLimit = /크기: [\d.]+GB\(([\d,]+)바이트\)/.exec(spec);
check('SPEC 수치', '크기 제한을 문서에서 읽었다', sizeLimit !== null, sizeLimit ? sizeLimit[1] : '없음');
if (sizeLimit) {
	const digits = sizeLimit[1].replaceAll(',', '');
	const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '_');
	check('SPEC 수치', `크기 제한 ${sizeLimit[1]}바이트`, findInCode(withSeparators).length > 0, withSeparators);
}
check('SPEC 수치', '길이 제한 7,200초', findInCode('7_200').length > 0);
check('SPEC 수치', '폴백 스택', css.includes("'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"));
check('DESIGN-SPEC 치수', '콘텐츠 1200px', css.includes('--container-content: 1200px;'));
check('DESIGN-SPEC 치수', '열 640px', css.includes('--container-column: 640px;'));
// ---- 7. 반경 표와 CSS ----
// 값을 여기에 적으면 문서를 고쳐도 검사가 옛 값을 본다. 표에서 읽어 대조한다
const radiusRows = [...design.matchAll(/^\|[^|]+\|\s*`([a-z]+)`\s*\|\s*(\d+)px\s*\|$/gm)];
check('DESIGN 반경 표', '표에서 행을 뽑았다', radiusRows.length > 0, `${radiusRows.length}행`);
for (const [, name, value] of radiusRows) {
	check('DESIGN 반경', `${name} ${value}px`, css.includes(`--radius-${name}: ${value}px;`));
}

check('DESIGN 간격', '간격 4px 배수', css.includes('--spacing: 4px;'));

process.exit(report() > 0 ? 1 : 0);
