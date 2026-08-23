// vite.config.ts 의 base 를 읽는다. 스크립트마다 '/malgeul/' 를 박으면 base 를 바꿀 때
// 네 곳이 조용히 어긋난다. 배포 산출물의 index.html 이 실제로 쓰인 base 를 담고 있으므로
// 거기서 뽑는다. dist 가 없으면 소스에서 읽는다.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_BASE = '/';

async function readFromDist() {
	const html = await readFile(resolve('dist/index.html'), 'utf8');
	const match = html.match(/src="([^"]*)\/assets\//);

	return match ? `${match[1]}/` : null;
}

async function readFromConfig() {
	const config = await readFile(resolve('vite.config.ts'), 'utf8');
	const match = config.match(/base:\s*'([^']+)'/);

	return match ? match[1] : null;
}

/** 앞뒤에 슬래시가 붙은 형태를 돌려준다. base 가 없으면 '/' 다 */
export async function readBase() {
	const fromDist = await readFromDist().catch(() => null);
	if (fromDist) {
		return fromDist;
	}

	const fromConfig = await readFromConfig().catch(() => null);

	return fromConfig ?? DEFAULT_BASE;
}
