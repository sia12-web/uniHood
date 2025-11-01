"use client";

import { useEffect, useState } from "react";

type SessionRow = {
	id: string;
	device: string;
	browser: string;
	ip: string;
	created_at: string;
	last_seen_at: string;
};

export default function SessionsSettingsPage() {
	const [sessions, setSessions] = useState<SessionRow[]>([]);

	useEffect(() => {
		// Placeholder data until backend wiring is complete.
		setSessions([
			{
				id: "current",
				device: "Windows",
				browser: "Edge 128",
				ip: "203.0.113.12",
				created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
				last_seen_at: new Date().toISOString(),
			},
		]);
	}, []);

	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-slate-900">Active sessions</h1>
				<p className="text-sm text-slate-600">Sign out of devices that should no longer have access to your Divan account.</p>
			</header>
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				{sessions.length === 0 ? (
					<p className="text-sm text-slate-500">No active sessions detected.</p>
				) : (
					<ul className="space-y-3 text-sm text-slate-600">
						{sessions.map((session) => (
							<li key={session.id} className="flex flex-col gap-1 rounded border border-slate-100 bg-slate-50 px-3 py-2">
								<span className="font-medium text-slate-800">{session.device} · {session.browser}</span>
								<span>IP {session.ip}</span>
								<span className="text-xs text-slate-500">Started {new Date(session.created_at).toLocaleString()}</span>
								<span className="text-xs text-slate-500">Last seen {new Date(session.last_seen_at).toLocaleString()}</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
