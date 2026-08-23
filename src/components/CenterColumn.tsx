import type { ReactNode } from 'react';

interface CenterColumnProps {
	children: ReactNode;
}

export function CenterColumn({ children }: CenterColumnProps) {
	return <div className="mx-auto flex w-full max-w-column flex-col gap-3">{children}</div>;
}
