"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";

const SUGGESTED_VISIONS = [
	"Working in an office as a software engineer",
	"Building a startup",
	"Game developer shipping my own studio title",
	"Film industry — directing a movie",
	"Full-stack engineer leading a product team",
	"AI/ML engineer working on real-world systems",
	"Cybersecurity analyst protecting critical systems",
	"Data scientist turning data into decisions",
	"Cloud engineer running scalable infrastructure",
	"Mobile developer shipping apps used by millions",
	"Product manager owning an end-to-end roadmap",
	"UX designer shaping delightful experiences",
	"Founder of a sustainable consumer brand",
	"Entrepreneur running a profitable local business",
	"Consultant helping teams solve hard problems",
	"Researcher publishing impactful papers",
	"PhD candidate in my field",
	"Professor teaching and mentoring students",
	"Doctor improving patient outcomes",
	"Nurse practitioner in a specialty clinic",
	"Therapist supporting mental health",
	"Physiotherapist helping people move pain-free",
	"Dentist running my own practice",
	"Pharmacist improving community health",
	"Public health professional working on prevention",
	"Biomedical engineer building medical devices",
	"Architect designing meaningful spaces",
	"Civil engineer building safer cities",
	"Mechanical engineer working on clean energy",
	"Electrical engineer designing smart systems",
	"Aerospace engineer working on space missions",
	"Environmental scientist protecting ecosystems",
	"Urban planner making cities more livable",
	"Chef running a restaurant",
	"Baker running a cozy bakery",
	"Barista opening a coffee shop",
	"Photographer building a creative studio",
	"Graphic designer with a strong personal brand",
	"Animator working on major productions",
	"Music producer releasing my own projects",
	"Professional musician touring and recording",
	"Writer publishing a novel",
	"Journalist reporting stories that matter",
	"Content creator running a creative business",
	"Marketing lead growing a mission-driven company",
	"Sales leader building long-term client relationships",
	"Finance professional becoming financially independent",
	"Accountant running my own firm",
	"Lawyer advocating for people and communities",
	"Policy analyst shaping better public policy",
	"Nonprofit leader scaling community programs",
	"Teacher inspiring the next generation",
	"School counselor guiding students",
	"Coach training athletes and building confidence",
	"Sports therapist working with teams",
	"Real estate investor building long-term wealth",
	"Engineer building climate-positive solutions",
	"Renewable energy specialist expanding solar/wind",
	"UX researcher understanding people deeply",
	"QA engineer improving product quality",
	"DevOps engineer improving reliability and speed",
	"Open-source maintainer growing a community",
	"Startup founder raising funding and hiring a team",
	"Small business owner with multiple locations",
	"Project manager delivering complex programs",
	"Operations lead making systems run smoothly",
	"Human resources leader building great culture",
	"Event planner running memorable experiences",
	"Traveling while working remotely",
	"Living abroad and fluent in a new language",
	"Homeowner with a stable routine",
	"Building a strong family and community",
	"Mentoring students and giving back",
	"Volunteering consistently for a cause I love",
	"Athlete competing at a high level",
	"Running a marathon each year",
	"Launching a YouTube channel about my passion",
	"Starting a podcast with meaningful guests",
	"Authoring a book and speaking at events",
	"Leading a team I’m proud of",
	"Building a life with balance and purpose",
];

const IDEAS_PAGE_SIZE = 12;

export default function VisionPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [campusId, setCampusId] = useState<string | null>(null);
	const [vision, setVision] = useState("");
	const [ideasOpen, setIdeasOpen] = useState(false);
	const [ideasLimit, setIdeasLimit] = useState(IDEAS_PAGE_SIZE);

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
				setVision(profile.ten_year_vision ?? "");
			} catch (err) {
				console.error("Failed to load profile", err);
				setError("Unable to load your profile. Please try again.");
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	const trimmed = useMemo(() => vision.trim(), [vision]);

	const visibleIdeas = useMemo(() => {
		if (!ideasOpen) return [];
		return SUGGESTED_VISIONS.slice(0, ideasLimit);
	}, [ideasOpen, ideasLimit]);

	const handleToggleIdeas = useCallback(() => {
		setIdeasOpen((prev) => {
			const next = !prev;
			if (next) {
				setIdeasLimit(IDEAS_PAGE_SIZE);
			}
			return next;
		});
	}, []);

	const handleSurpriseMe = useCallback(() => {
		const pick = SUGGESTED_VISIONS[Math.floor(Math.random() * SUGGESTED_VISIONS.length)];
		if (pick) {
			setVision(pick);
		}
	}, []);

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

			await patchProfile(auth.user_id, campusId, {
				ten_year_vision: trimmed || null,
			});

			router.push("/photos");
		} catch (err) {
			console.error(err);
			setError("Failed to save your vision. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
				<div className="w-full max-w-2xl space-y-8">
					<div className="flex flex-col items-center">
						<div className="h-9 w-48 bg-slate-200 rounded-lg animate-pulse mt-6" />
						<div className="h-5 w-80 bg-slate-100 rounded animate-pulse mt-2" />
					</div>
					<div className="mt-8 space-y-3">
						<div className="h-28 w-full bg-slate-100 rounded-md animate-pulse" />
						<div className="h-10 w-full bg-slate-200 rounded-md animate-pulse" />
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
						Your 10-Year Vision
					</h2>
					<p className="mt-2 text-center text-sm text-slate-600">
						How do you see yourself in 10 years? This helps you meet peers with similar goals.
					</p>
				</div>

				<form className="mt-4 space-y-6" onSubmit={handleSubmit}>
					{error && (
						<div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
							{error}
						</div>
					)}

					<div className="space-y-2">
						<label htmlFor="ten-year-vision" className="block text-sm font-medium text-slate-700">
							In 10 years, I see myself...
						</label>
						<textarea
							id="ten-year-vision"
							value={vision}
							onChange={(event) => setVision(event.target.value.slice(0, 500))}
							rows={4}
							maxLength={500}
							placeholder="e.g., Working in an office • Building a startup • Game developer • Directing films"
							className="mt-1 block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-indigo-600 sm:text-sm"
						/>
						<div className="flex items-center justify-between text-xs text-slate-500">
							<span>Optional</span>
							<span>{500 - vision.length} characters left</span>
						</div>
					</div>

					<div className="space-y-2">
						<div className="rounded-md border border-slate-200 bg-white p-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-slate-700">Need inspiration?</p>
									<p className="mt-1 text-xs text-slate-500">
										Tap an idea to autofill, or hit surprise.
									</p>
								</div>
								<button
									type="button"
									onClick={handleToggleIdeas}
									className="text-sm font-medium text-slate-600 hover:text-slate-900"
								>
									{ideasOpen ? "Hide ideas" : "Show ideas"}
								</button>
							</div>

							{ideasOpen ? (
								<div className="mt-3 flex flex-wrap gap-2">
									{visibleIdeas.map((suggestion) => (
										<button
											key={suggestion}
											type="button"
											onClick={() => setVision(suggestion)}
											className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-600 hover:text-indigo-600"
										>
											{suggestion}
										</button>
									))}
								</div>
							) : null}

							<div className="mt-4 flex flex-wrap items-center gap-3">
								<button
									type="button"
									onClick={handleSurpriseMe}
									className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-indigo-600 hover:text-indigo-600"
								>
									Surprise me
								</button>
								{ideasOpen && ideasLimit < SUGGESTED_VISIONS.length ? (
									<button
										type="button"
										onClick={() => setIdeasLimit((prev) => Math.min(prev + IDEAS_PAGE_SIZE, SUGGESTED_VISIONS.length))}
										className="text-xs font-semibold text-slate-600 hover:text-slate-900"
									>
										Show more ({Math.max(SUGGESTED_VISIONS.length - ideasLimit, 0)} left)
									</button>
								) : null}
							</div>
						</div>
					</div>

					<div className="flex items-center justify-between pt-2">
						<button
							type="button"
							onClick={() => router.push("/passions")}
							className="text-sm font-medium text-slate-600 hover:text-slate-900"
						>
							Back
						</button>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => router.push("/photos")}
								className="text-sm font-medium text-slate-500 hover:text-slate-700"
							>
								Skip
							</button>
							<button
								type="submit"
								disabled={submitting}
								className="group relative flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 disabled:opacity-70"
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
