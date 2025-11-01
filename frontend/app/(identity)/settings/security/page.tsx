"use client";

import Link from "next/link";

export default function SecuritySettingsPage() {
	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-slate-900">Security settings</h1>
				<p className="text-sm text-slate-600">Manage authentication, recovery, and verification preferences.</p>
			</header>
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-sm text-slate-600">
					Detailed security controls are coming soon. In the meantime, visit the <Link href="/identity/settings/verify" className="text-indigo-600 underline">verification portal</Link> to review your trust status.
				</p>
			</section>
		</main>
	);
}
