import { useEffect, useState } from 'react';

/** 플레이어에 걸 주소. 화면이 사는 동안 파일이 바뀌지 않는 자리에 쓴다. 떠날 때 풀어 준다 */
export function useObjectUrl(file: File) {
	const [url] = useState(() => URL.createObjectURL(file));

	useEffect(() => {
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [url]);

	return url;
}
