"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import PublicProfileView from "@/components/PublicProfileView";
import { fetchPublicProfile } from "@/lib/profiles";
import type { PublicProfile } from "@/lib/types";

export default function PublicProfilePage() {
	const params = useParams<{ handle: string }>();
	const [profile, setProfile] = useState<PublicProfile | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!params?.handle) {
			return;
		}
		let cancelled = false;
		async function load() {
			setLoading(true);
			try {
				const record = await fetchPublicProfile(params.handle as string);
				if (!cancelled) {
					setProfile(record);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Profile not found");
					setProfile(null);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [params?.handle]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			{loading ? <p className="text-sm text-slate-500">Loading profile…</p> : null}
			{error ? (
				<div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
			) : null}
			{!loading && profile ? <PublicProfileView profile={profile} /> : null}
		</main>
	);
}
