"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";

const currentYear = new Date().getFullYear();
const YEAR_MIN = currentYear;
const YEAR_MAX = currentYear + 8;

export default function MajorYearPage() {
	const [major, setMajor] = useState("");
	const [gradYear, setGradYear] = useState("");
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
				setMajor(profile.major ?? "");
				setGradYear(profile.graduation_year ? String(profile.graduation_year) : "");
			} catch (err) {
				console.error("Failed to load profile", err);
				setError("Unable to load your profile. Please try again.");
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	const gradYearHelp = useMemo(() => {
		if (!gradYear) return `Between ${YEAR_MIN} and ${YEAR_MAX}`;
		const parsed = Number(gradYear);
		if (Number.isNaN(parsed)) return "Enter a 4-digit year";
		if (parsed < YEAR_MIN || parsed > YEAR_MAX) return `Keep it between ${YEAR_MIN} and ${YEAR_MAX}`;
		return "Looks good";
	}, [gradYear]);

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
			const trimmedMajor = major.trim();
			const parsedYear = Number(gradYear);
			if (!trimmedMajor) {
				setError("Please enter your major.");
				setSubmitting(false);
				return;
			}
			if (!gradYear || Number.isNaN(parsedYear) || parsedYear < YEAR_MIN || parsedYear > YEAR_MAX) {
				setError(`Graduation year must be between ${YEAR_MIN} and ${YEAR_MAX}.`);
				setSubmitting(false);
				return;
			}

			await patchProfile(auth.user_id, campusId, {
				major: trimmedMajor,
				graduation_year: parsedYear,
			});

			router.push("/passions");
		} catch (err) {
			console.error(err);
			setError("Failed to save your details. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading...</div>;
	}

	return (
		<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
			<div className="w-full max-w-2xl space-y-8">
				<div className="flex flex-col items-center">
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
						Add your major
					</h2>
					<p className="mt-2 text-center text-sm text-slate-600">
						We use this to tailor study groups and suggestions.
					</p>
				</div>

				<form className="mt-8 space-y-6" onSubmit={handleSubmit}>
					{error && (
						<div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
							{error}
						</div>
					)}

					<div className="space-y-4">
						<div>
							<label htmlFor="major" className="block text-sm font-medium text-slate-700">
								Major or program
							</label>
							<input
								id="major"
								name="major"
								type="text"
								required
								value={major}
								onChange={(e) => setMajor(e.target.value)}
								maxLength={120}
								className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045] sm:text-sm"
								placeholder="e.g., Computer Science"
							/>
						</div>
						<div>
							<label htmlFor="gradYear" className="block text-sm font-medium text-slate-700">
								Graduation year
							</label>
							<input
								id="gradYear"
								name="gradYear"
								type="number"
								inputMode="numeric"
								min={YEAR_MIN}
								max={YEAR_MAX}
								required
								value={gradYear}
								onChange={(e) => setGradYear(e.target.value)}
								className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045] sm:text-sm"
								placeholder={`${YEAR_MIN + 3}`}
							/>
							<p className="mt-1 text-xs text-slate-500">{gradYearHelp}</p>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<button
							type="button"
							onClick={() => router.push("/select-university")}
							className="text-sm font-semibold text-slate-600 hover:text-slate-900"
						>
							Back
						</button>
						<button
							type="submit"
							disabled={submitting}
							className="group relative flex justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-2 text-sm font-medium text-white hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70"
						>
							{submitting ? "Saving..." : "Continue"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
