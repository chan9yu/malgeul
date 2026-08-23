import type { ReactNode } from 'react';

import { useBlockWindowFileDrop } from '../hooks/useBlockWindowFileDrop';
import { Footer } from './Footer';
import { Header } from './Header';

interface AppFrameProps {
	children: ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
	useBlockWindowFileDrop();

	return (
		<div className="flex min-h-full flex-col">
			<Header />
			<main className="mx-auto w-full max-w-content flex-1 px-4 py-5">{children}</main>
			<Footer />
		</div>
	);
}
