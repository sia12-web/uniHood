"use client";

import Link from 'next/link';

import { HashImportWizard } from '@/components/mod/safety/hash-import-wizard';

export default function HashImportPage() {
	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Import hash list</h1>
					<p className="text-sm text-slate-600">Validate rows locally before streaming them into the moderation hash store.</p>
				</div>
				<Link href="/admin/mod/safety/hashes" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
					Back to list
				</Link>
			</header>
			<HashImportWizard />
		</div>
	);
}
