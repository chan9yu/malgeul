// 결과 화면을 실제 Chrome 에 올려 화면이 돌려주는 값으로 확인한다.
// 단위 테스트는 판정 함수만 본다. 틀렸던 것은 브라우저가 돌려주는 currentTime 이라
// 판정 함수가 맞아도 화면에서 다른 행이 강조될 수 있다.
//
// 사용법: node scripts/qa/verify-result-screen.mjs
// 개발 서버와 Chrome 은 이 스크립트가 직접 띄우고 내린다.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readBase } from './base-url.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HARNESS = 'scripts/qa/result-harness/index.html';
const BASE = await readBase();
const RETRY_DELAY_MS = 250;
const CONNECT_RETRY_LIMIT = 40;
const SERVER_RETRY_LIMIT = 80;
const COPY_NOTICE_MS = 2000;

// 화면에 그려지는 값. 문서에서 옮겨 적었다
const EMPTY_NOTICE = '이 영상에서 문장을 찾지 못했습니다. 음성이 없거나 너무 작을 수 있습니다';
const BRAND_SOFT = 'rgb(230, 244, 239)';
const COPY_IDLE = '전체 복사';
const COPY_DONE = '복사했습니다';
const DOWNLOAD_LABELS = ['txt 내려받기', 'srt 내려받기', 'vtt 내려받기'];
const NEW_VIDEO = '새 영상 변환';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findFreePort() {
	return new Promise((res, rej) => {
		const probe = createServer();
		probe.on('error', rej);
		probe.listen(0, () => {
			const { port } = probe.address();
			probe.close(() => res(port));
		});
	});
}

async function waitForServer(port) {
	for (let attempt = 0; attempt < SERVER_RETRY_LIMIT; attempt += 1) {
		try {
			const response = await fetch(`http://localhost:${port}${BASE}${HARNESS}`);
			if (response.ok) return;
		} catch {
			// 아직 뜨지 않았다
		}
		await wait(RETRY_DELAY_MS);
	}
	throw new Error('개발 서버가 뜨지 않았다');
}

async function waitForDebugger(profileDir) {
	for (let attempt = 0; attempt < CONNECT_RETRY_LIMIT; attempt += 1) {
		try {
			const [port] = (await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n');
			const response = await fetch(`http://127.0.0.1:${port.trim()}/json/version`);
			return await response.json();
		} catch {
			await wait(RETRY_DELAY_MS);
		}
	}
	throw new Error('Chrome 디버깅 포트에 붙지 못했다');
}

function createClient(socket) {
	const pending = new Map();
	let lastId = 0;
	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		const settle = pending.get(message.id);
		if (settle) {
			pending.delete(message.id);
			settle(message);
		}
	});
	return (method, params = {}, sessionId) =>
		new Promise((res) => {
			lastId += 1;
			pending.set(lastId, res);
			socket.send(JSON.stringify({ id: lastId, method, params, sessionId }));
		});
}

const results = [];
const check = (group, label, ok, detail = '') => results.push({ group, label, ok, detail });

const port = await findFreePort();
const profileDir = await mkdtemp(join(tmpdir(), 'malgeul-result-'));
const downloadDir = await mkdtemp(join(tmpdir(), 'malgeul-dl-'));
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		'--remote-debugging-port=0',
		`--user-data-dir=${profileDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		// 행 클릭은 합성 클릭이라 사용자 제스처가 아니다. 이 플래그가 없으면 play() 가 막혀
		// 재생 중 판정을 확인할 수 없다
		'--autoplay-policy=no-user-gesture-required'
	],
	{ stdio: 'ignore' }
);

try {
	await waitForServer(port);
	const version = await waitForDebugger(profileDir);
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise((res, rej) => {
		socket.addEventListener('open', res, { once: true });
		socket.addEventListener('error', rej, { once: true });
	});

	const send = createClient(socket);
	const target = await send('Target.createTarget', { url: 'about:blank' });
	const attached = await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
	const sessionId = attached.result.sessionId;

	await send('Page.enable', {}, sessionId);
	await send('Runtime.enable', {}, sessionId);
	await send('Browser.grantPermissions', {
		origin: `http://localhost:${port}`,
		permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
	});
	await send(
		'Browser.setDownloadBehavior',
		{ behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true },
		sessionId
	);

	const evaluate = async (expression) => {
		const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
		if (out.result?.exceptionDetails) {
			throw new Error(out.result.exceptionDetails.exception?.description ?? '평가 실패');
		}

		return out.result?.result?.value;
	};

	const open = async (query) => {
		await send('Page.navigate', { url: `http://localhost:${port}${BASE}${HARNESS}${query}` }, sessionId);
		for (let attempt = 0; attempt < CONNECT_RETRY_LIMIT; attempt += 1) {
			await wait(RETRY_DELAY_MS);
			const ready = await evaluate("!!document.querySelector('video') && !!window.qaFixture");
			if (ready === true) return;
		}
		throw new Error(`화면이 뜨지 않았다: ${query}`);
	};

	// ---------------------------------------------------------------- 빈 목록
	await open('?scenario=empty');
	const empty = await evaluate(`(() => {
		// 바깥 감싸개도 같은 글을 담는다. 가장 안쪽 것을 잡아야 바탕색이 안내문의 것이다
		const notice = [...document.querySelectorAll('div')]
			.filter((n) => n.textContent.trim() === ${JSON.stringify(EMPTY_NOTICE)})
			.at(-1);
		const buttons = [...document.querySelectorAll('button')];
		const byText = (t) => buttons.find((b) => b.textContent.includes(t));
		const byLabel = (l) => buttons.find((b) => b.getAttribute('aria-label') === l);
		return {
			noticeFound: !!notice,
			noticeBackground: notice ? getComputedStyle(notice).backgroundColor : null,
			rows: document.querySelectorAll('ul li').length,
			copyDisabled: byText(${JSON.stringify(COPY_IDLE)})?.disabled ?? null,
			downloadsDisabled: ${JSON.stringify(DOWNLOAD_LABELS)}.map((l) => byLabel(l)?.disabled ?? null),
			newVideoDisabled: byText(${JSON.stringify(NEW_VIDEO)})?.disabled ?? null
		};
	})()`);

	check('빈 목록', '안내 문구가 그대로 그려진다', empty.noticeFound === true);
	check('빈 목록', 'brand-soft 바탕', empty.noticeBackground === BRAND_SOFT, `${empty.noticeBackground}`);
	check('빈 목록', '문장 행이 없다', empty.rows === 0, `${empty.rows}행`);
	check('빈 목록', '전체 복사가 비활성', empty.copyDisabled === true);
	check(
		'빈 목록',
		'내려받기 셋이 비활성',
		empty.downloadsDisabled.every((d) => d === true),
		JSON.stringify(empty.downloadsDisabled)
	);
	check('빈 목록', '새 영상 변환은 살아 있다', empty.newVideoDisabled === false);

	// ------------------------------------------------------- 시각 표기와 낭독기 라벨
	await open('?scenario=basic&count=6');
	const basic = await evaluate(`(() => {
		const stamps = [...document.querySelectorAll('ul li button > span:first-child')].map((s) => s.textContent);
		const buttons = [...document.querySelectorAll('button')];
		return {
			stamps,
			downloadLabels: buttons.filter((b) => /^(txt|srt|vtt)$/.test(b.textContent.trim())).map((b) => b.getAttribute('aria-label')),
			videoSeconds: window.qaFixture.videoSeconds,
			starts: window.qaFixture.transcript.segments.map((s) => s.startSeconds)
		};
	})()`);

	check(
		'시각 표기',
		'1시간 미만 영상은 mm:ss',
		basic.stamps.every((s) => /^\d{2}:\d{2}$/.test(s)),
		JSON.stringify(basic.stamps)
	);
	check(
		'낭독기 라벨',
		'내려받기 버튼에 대체 라벨',
		JSON.stringify(basic.downloadLabels) === JSON.stringify(DOWNLOAD_LABELS),
		JSON.stringify(basic.downloadLabels)
	);

	await open('?scenario=basic&count=6&duration=3700');
	const longVideo = await evaluate(
		"[...document.querySelectorAll('ul li button > span:first-child')].map((s) => s.textContent)"
	);
	check(
		'시각 표기',
		'1시간 이상 영상은 h:mm:ss',
		longVideo.every((s) => /^\d:\d{2}:\d{2}$/.test(s)),
		JSON.stringify(longVideo)
	);

	// ------------------------------------------------------------- 재생 중 판정
	await open('?scenario=basic&count=6');
	await evaluate(`(() => {
		const video = document.querySelector('video');
		window.qaTicks = 0;
		video.addEventListener('timeupdate', () => { window.qaTicks += 1; });
		return true;
	})()`);

	const playingIndex =
		"[...document.querySelectorAll('ul li button')].findIndex((b) => b.getAttribute('aria-current') === 'true')";

	const beforeFirst = await evaluate(`(() => {
		const video = document.querySelector('video');
		return { current: video.currentTime, index: ${playingIndex} };
	})()`);
	check(
		'재생 중 판정',
		'첫 문장 시작 전에는 강조가 없다',
		beforeFirst.index === -1,
		`currentTime ${beforeFirst.current}, 강조 ${beforeFirst.index}`
	);

	// 플레이어가 시작 시각에 정확히 서지 않는다는 것이 1밀리초 여유의 근거다.
	// 여유가 실제로 일하는지 보려면 착지 오차를 먼저 재야 한다. 재생이 앞으로 나가기 전에 읽는다
	const landing = await evaluate(`(async () => {
		const video = document.querySelector('video');
		const starts = window.qaFixture.transcript.segments.map((s) => s.startSeconds);
		const rows = [];
		for (const start of starts) {
			video.pause();
			video.currentTime = start;
			const immediate = video.currentTime;
			await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
			rows.push({ start, immediate, settled: video.currentTime });
		}
		return rows;
	})()`);

	const behind = landing.filter((r) => r.settled < r.start);
	const withinMillisecond = behind.every((r) => r.start - r.settled < 0.001);
	console.log('\n[착지 오차 실측] 시작 시각으로 옮긴 직후의 currentTime');
	for (const row of landing) {
		console.log(
			`  시작 ${row.start.toFixed(6)} -> 착지 ${row.settled.toFixed(6)} (차 ${(row.settled - row.start).toExponential(3)})`
		);
	}
	check(
		'1밀리초 여유',
		'플레이어가 시작 시각보다 앞에 선다',
		behind.length > 0,
		`${behind.length}/${landing.length}건이 시작 시각보다 앞`
	);
	check(
		'1밀리초 여유',
		'앞선 거리가 1밀리초보다 작다',
		withinMillisecond,
		behind.map((r) => (r.start - r.settled).toExponential(3)).join(', ')
	);

	// 행을 눌러 그 행이 강조되는지. 여러 행을 눌러 본다.
	// 첫 timeupdate 의 currentTime 도 함께 잡는다. 강조는 그 값으로 갈린다
	const clickRow = async (row) => {
		await evaluate(`(() => {
			const video = document.querySelector('video');
			window.qaTicks = 0;
			window.qaFirstTick = null;
			const onTick = () => {
				if (window.qaFirstTick === null) window.qaFirstTick = video.currentTime;
			};
			video.addEventListener('timeupdate', onTick, { once: true });
			[...document.querySelectorAll('ul li button')][${row}].click();
			return true;
		})()`);
		for (let attempt = 0; attempt < CONNECT_RETRY_LIMIT; attempt += 1) {
			await wait(RETRY_DELAY_MS);
			const state = await evaluate(`(() => {
				const video = document.querySelector('video');
				return {
					ticks: window.qaTicks,
					firstTick: window.qaFirstTick,
					current: video.currentTime,
					paused: video.paused,
					index: ${playingIndex}
				};
			})()`);
			if (state.firstTick !== null) return state;
		}
		throw new Error(`${row}행 클릭 뒤 timeupdate 가 오지 않았다`);
	};

	for (const row of [0, 2, 3, 5, 1]) {
		const state = await clickRow(row);
		const start = basic.starts[row];
		check(
			'재생 중 판정',
			`${row}행을 누르면 ${row}행이 강조된다`,
			state.index === row,
			`강조 ${state.index}, 첫 timeupdate ${state.firstTick.toFixed(6)} (시작 대비 ${(state.firstTick - start).toExponential(3)}), 재생중 ${!state.paused}`
		);
	}

	// React 는 timeupdate 핸들러가 끝난 뒤에 DOM 을 고친다. 이벤트 직후에 읽으면 이전 렌더가 잡힌다.
	// 값이 두 번 연달아 같을 때까지 기다린다
	const readIndexSettled = async () => {
		let previous = null;
		for (let attempt = 0; attempt < 12; attempt += 1) {
			await wait(150);
			const index = await evaluate(playingIndex);
			if (index === previous) return index;
			previous = index;
		}

		return previous;
	};

	// 마지막 문장은 위쪽 경계가 없다. 영상 끝으로 보내도 마지막 행이 남아야 한다
	const atEnd = await evaluate(`(async () => {
		const video = document.querySelector('video');
		video.currentTime = Math.max(0, video.duration - 0.05);
		await new Promise((r) => video.addEventListener('timeupdate', r, { once: true }));
		return { current: video.currentTime, duration: video.duration, rows: document.querySelectorAll('ul li').length };
	})()`);
	const atEndIndex = await readIndexSettled();
	check(
		'재생 중 판정',
		'마지막 문장이 영상 끝까지 남는다',
		atEndIndex === atEnd.rows - 1,
		`강조 ${atEndIndex}, 마지막 행 ${atEnd.rows - 1}, currentTime ${atEnd.current}, 길이 ${atEnd.duration}`
	);

	const rewound = await evaluate(`(async () => {
		const video = document.querySelector('video');
		video.pause();
		video.currentTime = 0;
		await new Promise((r) => video.addEventListener('timeupdate', r, { once: true }));
		return { current: video.currentTime };
	})()`);
	const rewoundIndex = await readIndexSettled();
	check(
		'재생 중 판정',
		'첫 문장 앞으로 되감으면 강조가 사라진다',
		rewoundIndex === -1,
		`강조 ${rewoundIndex}, currentTime ${rewound.current}`
	);

	// ------------------------------------------------------------------ 전체 복사
	await open('?scenario=basic&count=6');
	const copied = await evaluate(`(async () => {
		const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(COPY_IDLE)}));
		const widthBefore = button.getBoundingClientRect().width;
		button.click();
		await new Promise((r) => setTimeout(r, 300));
		const shown = button.innerText.trim();
		const widthAfter = button.getBoundingClientRect().width;
		const clipboard = await navigator.clipboard.readText();
		return { shown, widthBefore, widthAfter, clipboard };
	})()`);

	check('전체 복사', '성공 알림이 나온다', copied.shown === COPY_DONE, JSON.stringify(copied.shown));
	check(
		'전체 복사',
		'라벨이 바뀌어도 버튼 폭이 그대로다',
		Math.abs(copied.widthBefore - copied.widthAfter) < 0.5,
		`${copied.widthBefore} -> ${copied.widthAfter}`
	);

	const stamps = basic.stamps;
	const clipboardLines = copied.clipboard.split('\n').filter((l) => l.length > 0);
	check(
		'전체 복사',
		'클립보드 내용이 txt 형식이다',
		clipboardLines.length === stamps.length && clipboardLines.every((l, i) => l.startsWith(`[${stamps[i]}] `)),
		JSON.stringify(clipboardLines.slice(0, 2))
	);
	check(
		'전체 복사',
		'목록 타임스탬프와 txt 표기가 같다',
		clipboardLines.every((l, i) => l.slice(1, 1 + stamps[i].length) === stamps[i])
	);

	await wait(COPY_NOTICE_MS);
	const restored = await evaluate(`(() => {
		const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(COPY_IDLE)}));
		return button.innerText.trim();
	})()`);
	check('전체 복사', '2초 뒤 라벨이 돌아온다', restored === COPY_IDLE, JSON.stringify(restored));

	// 두 번째 누름도 그때부터 2초를 보여줘야 한다
	const repeated = await evaluate(`(async () => {
		const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(COPY_IDLE)}));
		button.click();
		await new Promise((r) => setTimeout(r, 1500));
		button.click();
		await new Promise((r) => setTimeout(r, 700));
		return button.innerText.trim();
	})()`);
	check(
		'전체 복사',
		'2초 안에 다시 누르면 그때부터 다시 2초를 센다',
		repeated === COPY_DONE,
		`두 번째 누름 0.7초 뒤 ${JSON.stringify(repeated)}`
	);

	// ------------------------------------------------------------------ 내려받기
	for (const label of DOWNLOAD_LABELS) {
		await evaluate(`(() => {
			[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)}).click();
			return true;
		})()`);
		await wait(600);
	}
	await wait(1200);

	const saved = (await readdir(downloadDir)).filter((n) => !n.endsWith('.crdownload')).sort();
	check(
		'내려받기',
		'원본 이름을 따르는 파일 셋이 저장된다',
		JSON.stringify(saved) === JSON.stringify(['meeting.srt', 'meeting.txt', 'meeting.vtt']),
		JSON.stringify(saved)
	);

	if (saved.includes('meeting.txt')) {
		const txt = await readFile(join(downloadDir, 'meeting.txt'), 'utf8');
		check('내려받기', 'txt 내용이 클립보드와 같다', txt === copied.clipboard);
	}
	if (saved.includes('meeting.srt')) {
		const srt = await readFile(join(downloadDir, 'meeting.srt'), 'utf8');
		check(
			'내려받기',
			'srt 는 밀리초를 쉼표로 쓴다',
			/^1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/.test(srt),
			srt.slice(0, 40)
		);
	}
	if (saved.includes('meeting.vtt')) {
		const vtt = await readFile(join(downloadDir, 'meeting.vtt'), 'utf8');
		check(
			'내려받기',
			'vtt 는 머리글과 마침표를 쓴다',
			/^WEBVTT\n\n\d{2}:\d{2}:\d{2}\.\d{3} --> /.test(vtt),
			vtt.slice(0, 40)
		);
	}

	// -------------------------------------------------------------- 새 영상 변환
	const newVideo = await evaluate(`(() => {
		window.qaNewVideoClicked = false;
		[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(NEW_VIDEO)})).click();
		return window.qaNewVideoClicked;
	})()`);
	check('새 영상 변환', '누르면 업로드로 돌아가는 콜백이 불린다', newVideo === true);

	// ---------------------------------------------------------------- 결과 화면 성능
	const manyCount = 700;
	await send('Page.navigate', { url: 'about:blank' }, sessionId);
	await wait(300);
	await send(
		'Page.addScriptToEvaluateOnNewDocument',
		{
			source: `window.qaLongTasks = [];
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						window.qaLongTasks.push({ start: entry.startTime, duration: entry.duration });
					}
				}).observe({ entryTypes: ['longtask'] });`
		},
		sessionId
	);
	await open(`?scenario=many&count=${manyCount}`);

	const rendered = await evaluate("document.querySelectorAll('ul li').length");
	check('결과 화면 성능', `${manyCount}행이 그려진다`, rendered === manyCount, `${rendered}행`);

	const afterRender = await evaluate('window.qaLongTasks.length');

	// 2단 배치와 고정. 행이 많은 이 화면이라야 스크롤이 생겨 고정을 확인할 수 있다
	await send(
		'Emulation.setDeviceMetricsOverride',
		{ width: 1400, height: 900, deviceScaleFactor: 1, mobile: false },
		sessionId
	);
	await wait(300);
	const layout = await evaluate(`(async () => {
		const video = document.querySelector('video');
		const list = document.querySelector('ul');
		const toolbar = list.parentElement.firstElementChild;
		const left = video.closest('div');
		const content = left.parentElement;
		const rect = (n) => n.getBoundingClientRect();
		const before = { video: rect(video).top, toolbar: rect(toolbar).top };
		window.scrollTo(0, 1500);
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const after = { video: rect(video).top, toolbar: rect(toolbar).top, scrolled: window.scrollY };
		const leftRect = rect(left);
		const videoRect = rect(video);
		return {
			widthRatio: leftRect.width / rect(content).width,
			leftWidth: leftRect.width,
			aspect: videoRect.width / videoRect.height,
			sideBySide: rect(list).left > leftRect.right - 1,
			before,
			after
		};
	})()`);

	check(
		'2단 배치',
		'왼쪽 열이 45% 이고 최소 420px 이다',
		Math.abs(layout.widthRatio - 0.45) < 0.02 && layout.leftWidth >= 420,
		`${(layout.widthRatio * 100).toFixed(1)}%, ${layout.leftWidth.toFixed(0)}px`
	);
	check('2단 배치', '목록이 플레이어 오른쪽에 온다', layout.sideBySide === true);
	check('2단 배치', '플레이어가 16:9 다', Math.abs(layout.aspect - 16 / 9) < 0.02, layout.aspect.toFixed(3));
	check(
		'2단 배치',
		'스크롤해도 플레이어가 따라온다',
		layout.after.scrolled > 500 && layout.after.video < layout.before.video + 20,
		`${layout.after.scrolled}px 내려도 플레이어 top ${layout.after.video.toFixed(0)}`
	);
	check(
		'2단 배치',
		'스크롤해도 도구 막대가 위에 남는다',
		layout.after.toolbar >= -1 && layout.after.toolbar < 20,
		`도구 막대 top ${layout.after.toolbar.toFixed(0)}`
	);
	await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);

	const measured = await evaluate(`(async () => {
		const video = document.querySelector('video');
		window.qaLongTasks = [];
		window.qaTicks = 0;
		const seen = new Set();
		video.addEventListener('timeupdate', () => {
			window.qaTicks += 1;
			const row = [...document.querySelectorAll('ul li button')].findIndex((b) => b.getAttribute('aria-current') === 'true');
			seen.add(row);
		});
		video.currentTime = 0;
		video.playbackRate = 4;
		await video.play();
		await new Promise((r) => {
			video.addEventListener('ended', r, { once: true });
			setTimeout(r, 30000);
		});
		const tasks = window.qaLongTasks;
		return {
			ticks: window.qaTicks,
			distinctRows: seen.size,
			playedSeconds: video.currentTime,
			longTasks: tasks.length,
			totalBlockingMs: tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0),
			worstMs: tasks.reduce((worst, t) => Math.max(worst, t.duration), 0)
		};
	})()`);

	check(
		'결과 화면 성능',
		'재생 중 강조가 실제로 여러 행을 지난다',
		measured.distinctRows > 5,
		`${measured.distinctRows}개 행, timeupdate ${measured.ticks}회`
	);
	check(
		'결과 화면 성능',
		'재생 중 긴 작업이 없다',
		measured.longTasks === 0,
		`긴 작업 ${measured.longTasks}건, 합계 차단 ${measured.totalBlockingMs.toFixed(1)}ms, 최장 ${measured.worstMs.toFixed(1)}ms`
	);
	console.log(
		`\n[성능 실측] 초기 렌더 긴 작업 ${afterRender}건, 재생 중 긴 작업 ${measured.longTasks}건, ` +
			`합계 차단 ${measured.totalBlockingMs.toFixed(1)}ms, 최장 ${measured.worstMs.toFixed(1)}ms, ` +
			`timeupdate ${measured.ticks}회, 지난 행 ${measured.distinctRows}개 (개발 서버 기준)`
	);
} finally {
	chrome.kill();
	server.kill();
	await rm(profileDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
	await rm(downloadDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}

let failed = 0;
let currentGroup = '';
for (const r of results) {
	if (r.group !== currentGroup) {
		console.log(`\n[${r.group}]`);
		currentGroup = r.group;
	}
	if (!r.ok) failed += 1;
	console.log(`  ${r.ok ? '통과' : '실패'}  ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n대조 ${results.length}건, 실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
