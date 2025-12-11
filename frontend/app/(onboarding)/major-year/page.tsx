"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";

import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";

const currentYear = new Date().getFullYear();
const YEAR_MIN = currentYear;
const YEAR_MAX = currentYear + 8;

const MAJORS = [
	"Accounting",
	"Aerospace Engineering",
	"Anthropology",
	"Architecture",
	"Art History",
	"Biochemistry",
	"Biology",
	"Biomedical Engineering",
	"Business Administration",
	"Chemical Engineering",
	"Chemistry",
	"Civil Engineering",
	"Communications",
	"Computer Engineering",
	"Computer Science",
	"Criminal Justice",
	"Cybersecurity",
	"Data Science",
	"Dentistry",
	"Economics",
	"Education",
	"Electrical Engineering",
	"English Literature",
	"Environmental Science",
	"Fashion Design",
	"Film Studies",
	"Finance",
	"Fine Arts",
	"Forensic Science",
	"Graphic Design",
	"Health Sciences",
	"History",
	"Hospitality Management",
	"Human Resources",
	"Industrial Engineering",
	"Information Technology",
	"International Relations",
	"Journalism",
	"Law",
	"Liberal Arts",
	"Linguistics",
	"Management Information Systems",
	"Marketing",
	"Mathematics",
	"Mechanical Engineering",
	"Medicine",
	"Music",
	"Neuroscience",
	"Nursing",
	"Nutrition",
	"Pharmacy",
	"Philosophy",
	"Physics",
	"Political Science",
	"Psychology",
	"Public Health",
	"Public Relations",
	"Robotics",
	"Social Work",
	"Sociology",
	"Software Engineering",
	"Statistics",
	"Theater Arts",
	"Undeclared",
	"Urban Planning",
	"Veterinary Medicine",
	"Zoology",
].sort();

export default function MajorYearPage() {
	const [major, setMajor] = useState("");
	const [gradYear, setGradYear] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [campusId, setCampusId] = useState<string | null>(null);

	const [isMajorOpen, setIsMajorOpen] = useState(false);
	const majorInputRef = useRef<HTMLInputElement>(null);
	const majorListRef = useRef<HTMLUListElement>(null);

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

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				majorInputRef.current &&
				!majorInputRef.current.contains(event.target as Node) &&
				majorListRef.current &&
				!majorListRef.current.contains(event.target as Node)
			) {
				setIsMajorOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const filteredMajors = useMemo(() => {
		if (!major) return MAJORS;
		const lower = major.toLowerCase();
		return MAJORS.filter((m) => m.toLowerCase().includes(lower));
	}, [major]);

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

	const handleSelectMajor = (selectedMajor: string) => {
		setMajor(selectedMajor);
		setIsMajorOpen(false);
	};

	if (loading) {
		return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
	}

	return (
		<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
			<div className="w-full max-w-2xl space-y-8">
				<div className="flex flex-col items-center">
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
						Add Your Major
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
						<div className="relative">
							<label htmlFor="major" className="block text-sm font-medium text-slate-700">
								Major or program
							</label>
							<div className="relative mt-1">
								<input
									ref={majorInputRef}
									id="major"
									name="major"
									type="text"
									required
									value={major}
									onChange={(e) => {
										setMajor(e.target.value);
										setIsMajorOpen(true);
									}}
									onFocus={() => setIsMajorOpen(true)}
									maxLength={120}
									className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045] sm:text-sm"
									placeholder="Search for your major..."
									autoComplete="off"
								/>
								<div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
									<ChevronsUpDown className="h-4 w-4" />
								</div>
							</div>

							{isMajorOpen && (
								<ul
									ref={majorListRef}
									className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
								>
									{filteredMajors.length === 0 ? (
										<li className="relative cursor-default select-none px-4 py-2 text-slate-500">
											No majors found.
										</li>
									) : (
										filteredMajors.map((m) => (
											<li
												key={m}
												className={cn(
													"relative cursor-pointer select-none px-4 py-2 transition-colors hover:bg-[#fff0f1] hover:text-[#d64045]",
													major === m ? "bg-[#fff0f1] text-[#d64045] font-medium" : "text-slate-900"
												)}
												onClick={() => handleSelectMajor(m)}
											>
												<span className="block truncate">{m}</span>
												{major === m && (
													<span className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#d64045]">
														<Check className="h-4 w-4" />
													</span>
												)}
											</li>
										))
									)}
								</ul>
							)}
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

					<div className="flex items-center justify-between pt-4">
						<button
							type="button"
							onClick={() => router.push("/select-university")}
							className="text-sm font-medium text-slate-600 hover:text-slate-900"
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
