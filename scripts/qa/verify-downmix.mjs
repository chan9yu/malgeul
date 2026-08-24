// 실제 파일을 앱의 추출 경로에 그대로 태워 채널이 섞이는지 확인한다.
// 다운믹스 자체는 순수 함수라 pnpm test 가 덮지만, decodeAudioData 가 몇 채널을 주는지와
// 그것이 추출 결과까지 이어지는지는 브라우저에서만 드러난다.
//
// 사용법: node scripts/qa/verify-downmix.mjs  (개발 서버를 직접 띄운다)

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

import { readBase } from './base-url.mjs';
import { createChecklist } from './checklist.mjs';
import { createEvaluate, findFreePort, launchChrome, wait, waitForUrl } from './chrome.mjs';

const CASES = [
	{
		file: '_workspace/fixtures/korean-8channel.mov',
		label: '8채널 mov. 목소리가 채널 1 에만 있다',
		expectChannels: 8
	},
	{
		file: '_workspace/fixtures/korean-speech.mp4',
		label: '모노 mp4. 한국어 음성',
		expectChannels: 1
	}
];

const SILENT_RMS = 0.0005;

function buildProbe(base, path) {
	return `(async () => {
		const { extractAudio } = await import('${base}src/services/index.ts');
		const bytes = await (await fetch('${base}${path}')).arrayBuffer();
		const name = '${path}'.split('/').pop();
		const file = new File([bytes], name, { type: name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4' });

		// 몇 채널로 해독되는지 따로 잰다. 추출 결과만 보면 채널이 몇이었는지 알 수 없다
		const probe = new OfflineAudioContext(1, 1, 16000);
		const decoded = await probe.decodeAudioData(bytes.slice(0));
		const perChannelRms = [];
		for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
			const d = decoded.getChannelData(ch);
			let sum = 0;
			for (let i = 0; i < d.length; i += 1) sum += d[i] * d[i];
			perChannelRms.push(Number(Math.sqrt(sum / d.length).toFixed(5)));
		}

		const extracted = await extractAudio(file);
		let sum = 0;
		for (let i = 0; i < extracted.pcm.length; i += 1) sum += extracted.pcm[i] * extracted.pcm[i];

		return {
			channels: decoded.numberOfChannels,
			perChannelRms,
			seconds: Number(extracted.durationSeconds.toFixed(2)),
			sampleRate: extracted.sampleRate,
			rms: Number(Math.sqrt(sum / extracted.pcm.length).toFixed(5))
		};
	})()`;
}

for (const item of CASES) {
	try {
		await access(item.file);
	} catch {
		console.error(`픽스처가 없다: ${item.file}`);
		console.error('scripts/qa/fixtures/ 의 생성기로 만든다');
		process.exit(1);
	}
}

const port = await findFreePort();
const base = await readBase();
const url = `http://localhost:${port}${base}`;

const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const chrome = await launchChrome({ profilePrefix: 'malgeul-downmix-' });
const { check, report } = createChecklist();

try {
	await waitForUrl(url);
	const { send, sessionId } = await chrome.attach();
	await send('Runtime.enable', {}, sessionId);
	await send('Page.navigate', { url }, sessionId);
	await wait(1500);

	const evaluate = createEvaluate(send, sessionId);

	for (const item of CASES) {
		const measured = await evaluate(buildProbe(base, item.file));
		const group = item.label;

		check(
			'채널 수',
			`${group}: ${item.expectChannels}채널로 해독된다`,
			measured.channels === item.expectChannels,
			`${measured.channels}채널`
		);

		// 채널 하나라도 소리가 있으면 합친 결과에도 소리가 남아야 한다.
		// 어느 채널에 있었는지를 함께 찍어야 통과가 우연이 아닌 것이 보인다
		const loud = measured.perChannelRms.filter((rms) => rms > SILENT_RMS);
		check(
			'원본',
			`${group}: 소리가 있는 채널을 찾았다`,
			loud.length > 0,
			`채널별 ${JSON.stringify(measured.perChannelRms)}`
		);
		check('추출 결과', `${group}: 소리가 남아 있다`, measured.rms > SILENT_RMS, `세기 ${measured.rms}`);
		check('추출 결과', `${group}: 16kHz 다`, measured.sampleRate === 16000, `${measured.sampleRate}Hz`);
		check('추출 결과', `${group}: 길이가 0 이 아니다`, measured.seconds > 1, `${measured.seconds}초`);
	}

	process.exitCode = report() > 0 ? 1 : 0;
} finally {
	await chrome.close();
	server.kill();
}
