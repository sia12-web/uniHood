"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";

const PASSION_LIMIT = 6;
const SUGGESTED = [
	"Hackathons",
	"AI",
	"Product Design",
	"Startups",
	"Psychology",
	"Finance",
	"Data Science",
	"Gaming",
	"Writing",
	"Volunteering",
	"Music",
	"Travel",
	"Photography",
	"Sports",
	"Outdoors",
	"Cooking",
	"Fitness",
	"Movies",
	"Books",
	"Board Games",
	"Community Service",
	"Mental Health",
	"Entrepreneurship",
	"Social Events",
];

export default function PassionsPage() {
	const [passions, setPassions] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [campusId, setCampusId] = useState<string | null>(null);
	const router = useRouter();

	useEffect(() => {
		const load = async () => {
			try {
				const auth = readAuthSnapshot();
				if (!auth?.user_id) {
					router.replace("/login");
					return;
				}
				const profile = await fetchProfile(auth.user_id, null);
				setCampusId(profile.campus_id ?? null);
				setPassions(profile.passions ?? []);
			} catch (err) {
				console.error("Failed to load profile", err);
				setError("Unable to load your profile. Please try again.");
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	const remaining = useMemo(() => PASSION_LIMIT - passions.length, [passions.length]);

	const addPassion = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		if (passions.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return;
		if (passions.length >= PASSION_LIMIT) {
			setError(`You can add up to ${PASSION_LIMIT} passions.`);
			return;
		}
		setPassions([...passions, trimmed]);
		setDraft("");
		setError(null);
	};

	const removePassion = (value: string) => {
		setPassions((prev) => prev.filter((item) => item.toLowerCase() !== value.toLowerCase()));
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) {
				router.replace("/login");
				return;
			}
			// Passions are optional, allow continuing with 0
			await patchProfile(auth.user_id, campusId, { passions });
			router.push("/vision");
		} catch (err) {
			console.error(err);
			setError("Failed to save passions. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
				<div className="w-full max-w-2xl space-y-8">
					{/* Skeleton header */}
					<div className="flex flex-col items-center">
						<div className="h-9 w-44 bg-slate-200 rounded-lg animate-pulse mt-6" />
						<div className="h-5 w-72 bg-slate-100 rounded animate-pulse mt-2" />
						<div className="h-4 w-40 bg-slate-50 rounded animate-pulse mt-1" />
					</div>
					{/* Skeleton chips */}
					<div className="mt-8 space-y-6">
						<div className="flex flex-wrap gap-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="h-8 w-24 bg-slate-100 rounded-full animate-pulse" />
							))}
						</div>
						<div className="flex gap-2">
							<div className="h-10 flex-1 bg-slate-100 rounded-md animate-pulse" />
							<div className="h-10 w-16 bg-slate-100 rounded-md animate-pulse" />
						</div>
						<div className="flex flex-wrap gap-2">
							{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
								<div key={i} className="h-7 w-20 bg-slate-50 rounded-full animate-pulse" />
							))}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
			<div className="w-full max-w-2xl space-y-8">
				<div className="flex flex-col items-center">
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
						Pick Your Passions
					</h2>
					<p className="mt-2 text-center text-sm text-slate-600">
						Choose up to {PASSION_LIMIT}. We use these to tailor recommendations.
					</p>
					<p className="mt-1 text-xs text-slate-500">At least 3 required. {remaining} slots left.</p>
				</div>

				<form className="mt-8 space-y-6" onSubmit={handleSubmit}>
					{error && (
						<div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
							{error}
						</div>
					)}

					<div className="flex flex-wrap gap-2">
						{passions.map((item) => (
							<span
								key={item.toLowerCase()}
								className="group inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
							>
								{item}
								<button
									type="button"
									onClick={() => removePassion(item)}
									className="text-slate-500 transition hover:text-rose-500"
									aria-label={`Remove ${item}`}
								>
									×
								</button>
							</span>
						))}
					</div>

					<div className="flex flex-wrap gap-2">
						<input
							type="text"
							value={draft}
							onChange={(event) => setDraft(event.target.value.slice(0, 40))}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === ",") {
									event.preventDefault();
									addPassion(draft);
								}
							}}
							maxLength={40}
							placeholder={passions.length === 0 ? "e.g., Hackathons" : "Add another passion"}
							className="grow rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045]"
						/>
						<button
							type="button"
							onClick={() => addPassion(draft)}
							disabled={draft.trim().length === 0}
							className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Add
						</button>
					</div>

					<div className="flex flex-wrap gap-2">
						{SUGGESTED.map((item) => (
							<button
								key={item}
								type="button"
								onClick={() => addPassion(item)}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-[#d64045] hover:text-[#d64045]"
								disabled={passions.length >= PASSION_LIMIT}
							>
								{item}
							</button>
						))}
					</div>

					<div className="flex items-center justify-between pt-4">
						<button
							type="button"
							onClick={() => router.push("/select-courses")}
							className="text-sm font-medium text-slate-600 hover:text-slate-900"
						>
							Back
						</button>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => router.push("/vision")}
								className="text-sm font-medium text-slate-500 hover:text-slate-700"
							>
								Skip
							</button>
							<button
								type="submit"
								disabled={submitting}
								className="group relative flex justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-2 text-sm font-medium text-white hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70"
							>
								{submitting ? "Saving..." : "Continue"}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
