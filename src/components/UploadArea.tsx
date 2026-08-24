import type { ChangeEvent } from 'react';
import { useRef } from 'react';

import { Button } from './Button';

const IDLE_CLASS = 'border-dashed border-border bg-surface';
const DRAGGING_CLASS = 'border-solid border-brand bg-brand-soft';

interface UploadAreaProps {
	dragging: boolean;
	onFilesPicked: (files: readonly File[]) => void;
}

export function UploadArea({ dragging, onFilesPicked }: UploadAreaProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const picked = event.target.files;
		onFilesPicked(picked ? Array.from(picked) : []);
		event.target.value = '';
	};

	return (
		<div
			className={`flex h-60 flex-col items-center justify-center gap-5 rounded-card border-2 ${dragging ? DRAGGING_CLASS : IDLE_CLASS}`}
		>
			{dragging ? (
				<p className="text-body font-semibold text-brand-strong">여기에 놓으면 업로드됩니다</p>
			) : (
				<p className="text-body text-text-sub">영상 파일을 여기에 끌어다 놓거나</p>
			)}
			<Button variant="primary" onClick={() => inputRef.current?.click()}>
				파일 선택
			</Button>
			<input ref={inputRef} type="file" accept=".mp4,.mov" className="hidden" onChange={handleChange} />
		</div>
	);
}
