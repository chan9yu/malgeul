import { useState } from 'react';

/** 접속 시점에 한 번 읽고 그 값을 고정한다. 판별이 렌더마다 흔들리면 화면이 바뀔 수 있다 */
export function useWebGpuSupport() {
	const [supported] = useState(() => 'gpu' in navigator);

	return supported;
}
