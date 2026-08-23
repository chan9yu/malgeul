/**
 * 검사 결과를 모아 묶음별로 출력한다. 게이트마다 출력이 다르면 읽는 사람이 매번 형식을 다시 파악한다.
 * report 는 실패 건수를 돌려준다. 부르는 쪽이 그 값으로 종료 코드를 정한다.
 */
export function createChecklist() {
	const results = [];

	const check = (group, label, ok, detail = '') => results.push({ group, label, ok, detail });

	const report = () => {
		let failed = 0;
		let currentGroup = '';

		for (const result of results) {
			if (result.group !== currentGroup) {
				console.log(`\n[${result.group}]`);
				currentGroup = result.group;
			}

			if (!result.ok) {
				failed += 1;
			}

			console.log(`  ${result.ok ? '통과' : '실패'}  ${result.label}${result.detail ? `  (${result.detail})` : ''}`);
		}

		console.log(`\n대조 ${results.length}건, 실패 ${failed}건`);

		return failed;
	};

	return { check, report };
}
