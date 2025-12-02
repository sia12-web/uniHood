"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search } from "lucide-react";

import { fetchProfile, fetchPopularCourses, saveProfileCourses, type Course } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";

export default function SelectCoursesPage() {
	const [courses, setCourses] = useState<Course[]>([]);
	const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
	const [customInput, setCustomInput] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [campusId, setCampusId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
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
                if (!profile.campus_id) {
                    router.replace("/select-university");
                    return;
                }
                setCampusId(profile.campus_id || null);
                const popular = await fetchPopularCourses(profile.campus_id);
                setCourses(popular);
            } catch (err) {
                console.error("Failed to load courses", err);
                setError("Unable to load courses.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [router]);

	const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, " ");

	const toggleCourse = (code: string) => {
		const normalized = normaliseCode(code);
		if (!normalized) return;
		const next = new Set(selectedCodes);
		if (next.has(normalized)) {
			next.delete(normalized);
		} else {
			next.add(normalized);
		}
		setSelectedCodes(next);
	};

	const handleAddCustom = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const code = normaliseCode(customInput);
		if (!code) return;

		// Basic validation: must be alphanumeric
		if (!/^[A-Z0-9\s-]+$/.test(code)) {
			setError("Course code contains invalid characters.");
			return;
		}

		const next = new Set(selectedCodes);
        next.add(code);
        setSelectedCodes(next);
        setCustomInput("");
        setError(null);
    };

    const removeCourse = (code: string) => {
		const next = new Set(selectedCodes);
		next.delete(normaliseCode(code));
		setSelectedCodes(next);
	};

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const auth = readAuthSnapshot();
            if (!auth?.user_id || !campusId) return;

			const codes = Array.from(selectedCodes).map(normaliseCode).filter(Boolean);
			// Deduplicate after normalization
			const unique = Array.from(new Set(codes));
			if (unique.length === 0) {
				setError("Please add at least one course or skip.");
				setSubmitting(false);
				return;
			}
			await saveProfileCourses(auth.user_id, campusId, unique);

			router.push("/passions");
		} catch (err) {
			console.error(err);
			setError("Failed to save courses.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading...</div>;
    }

    // Filter popular courses to exclude ones already selected (so they don't appear twice if we wanted, 
    // but here we might want to keep them in the "Popular" list to show they are selected).
    // Let's keep them in the list but mark them as selected.

    return (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-3xl space-y-8 bg-white p-6 md:p-10 rounded-3xl shadow-xl ring-1 ring-slate-100">
                <div className="flex flex-col items-center">

                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
                        What are you studying?
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-600 max-w-sm">
                        Add your courses to find classmates and study groups.
                    </p>
                </div>

                <div className="space-y-6">
                    {error && (
                        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-100">
                            {error}
                        </div>
                    )}

                    {/* Custom Input */}
                    <div className="relative">
                        <label htmlFor="custom-course" className="sr-only">Add a course</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <Search className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    id="custom-course"
                                    className="block w-full rounded-xl border-slate-200 pl-10 pr-3 py-3 text-slate-900 placeholder:text-slate-400 focus:border-[#d64045] focus:ring-[#d64045] sm:text-sm bg-slate-50"
                                    placeholder="Add a course (e.g. MATH 201)"
                                    value={customInput}
                                    onChange={(e) => setCustomInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddCustom();
                                        }
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleAddCustom()}
                                disabled={!customInput.trim()}
                                aria-label="Add course"
                                className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Selected Courses Area */}
                    {selectedCodes.size > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-slate-900">Selected Courses</h3>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(selectedCodes).map(code => (
                                    <span
                                        key={code}
                                        className="inline-flex items-center gap-1 rounded-full bg-[#d64045]/10 px-3 py-1 text-sm font-medium text-[#d64045] ring-1 ring-inset ring-[#d64045]/20"
                                    >
                                        {code}
                                        <button
                                            type="button"
                                            onClick={() => removeCourse(code)}
                                            className="group relative -mr-1 h-3.5 w-3.5 rounded-sm hover:bg-[#d64045]/20"
                                        >
                                            <span className="sr-only">Remove {code}</span>
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Popular Suggestions */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-slate-500">Popular at your university</h3>
                        <div className="flex flex-wrap gap-2">
                            {courses.map((course) => {
                                const isSelected = selectedCodes.has(course.code);
                                return (
                                    <button
                                        key={course.code}
                                        type="button"
                                        onClick={() => toggleCourse(course.code)}
                                        className={`
                                            inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all
                                            ${isSelected
                                                ? 'bg-[#d64045] text-white shadow-md transform scale-105'
                                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
                                            }
                                        `}
                                    >
                                        {course.code}
                                        {course.name && <span className={`ml-1.5 text-xs ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{course.name}</span>}
                                    </button>
                                );
                            })}
                            {courses.length === 0 && (
                                <p className="text-sm text-slate-400 italic">No popular courses found yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 space-y-3">
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full rounded-xl bg-[#d64045] px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#d64045]/20 transition-all hover:bg-[#c7343a] hover:shadow-[#d64045]/40 focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {submitting ? "Saving..." : "Continue"}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/passions")}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                            Skip for now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
