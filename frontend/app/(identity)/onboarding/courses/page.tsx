"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { fetchPopularCourses, saveProfileCourses, fetchProfile, type Course } from "@/lib/identity";
import BrandLogo from "@/components/BrandLogo";

export default function CoursesOnboardingPage() {
  const [popularCourses, setPopularCourses] = useState<Course[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [customCourse, setCustomCourse] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const router = useRouter();
  const [campusId, setCampusId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const auth = readAuthSnapshot();
      if (!auth?.user_id) {
        router.replace("/login");
        return;
      }
      setUserId(auth.user_id);

      try {
        const profile = await fetchProfile(auth.user_id, null);
        if (profile.campus_id) {
            setCampusId(profile.campus_id);
            const courses = await fetchPopularCourses(profile.campus_id);
            setPopularCourses(courses);
        }
      } catch (err) {
        console.error("Failed to load courses", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const toggleCourse = (code: string) => {
    setSelectedCourses((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const addCustomCourse = (e: React.FormEvent) => {
    e.preventDefault();
    const code = customCourse.trim().toUpperCase();
    if (code && !selectedCourses.includes(code)) {
      setSelectedCourses((prev) => [...prev, code]);
      setCustomCourse("");
    }
  };

  const handleSubmit = async () => {
    if (!userId || !campusId) return;
    setSubmitting(true);
    try {
      await saveProfileCourses(userId, campusId, selectedCourses);
      setSubmitting(false);
      // Show welcome screen
      setWelcome(true);
      setTimeout(() => {
        router.replace("/");
      }, 2000);
    } catch (err) {
      console.error("Failed to save courses", err);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (welcome) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-6 text-center">
          <BrandLogo withWordmark logoWidth={400} logoHeight={400} logoClassName="h-40 w-auto" className="text-[#b7222d]" />
          <h1 className="text-4xl font-bold text-slate-900">Welcome to Divan!</h1>
          <p className="text-lg text-slate-600">You're all set. Redirecting you to the dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-white text-base">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
        <header className="mb-8 flex flex-col gap-4">
            <BrandLogo withWordmark logoWidth={400} logoHeight={400} logoClassName="h-32 w-auto" className="text-[#b7222d]" />
            <h1 className="text-3xl font-bold text-slate-900">What are you studying?</h1>
            <p className="text-slate-600">Select your courses to find classmates.</p>
        </header>

        <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Popular Courses</h2>
            <div className="flex flex-wrap gap-3">
                {popularCourses.map((course) => (
                    <button
                        key={course.code}
                        onClick={() => toggleCourse(course.code)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            selectedCourses.includes(course.code)
                                ? "bg-[#d64045] text-white shadow-md"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                    >
                        {course.code}
                        {course.name && <span className="ml-2 opacity-75 text-xs hidden sm:inline"> - {course.name}</span>}
                    </button>
                ))}
            </div>
        </section>

        <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Add Other Courses</h2>
            <form onSubmit={addCustomCourse} className="flex gap-2">
                <input
                    type="text"
                    value={customCourse}
                    onChange={(e) => setCustomCourse(e.target.value)}
                    placeholder="e.g. HIST 201"
                    className="flex-1 rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
                <button
                    type="submit"
                    disabled={!customCourse.trim()}
                    className="rounded-xl bg-slate-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                    Add
                </button>
            </form>
        </section>

        <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">Selected Courses</h2>
            {selectedCourses.length === 0 ? (
                <p className="text-slate-500 italic">No courses selected yet.</p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {selectedCourses.map((code) => (
                        <div key={code} className="flex items-center gap-2 rounded-full bg-[#fbeaec] px-4 py-2 text-sm font-medium text-[#b7222d] border border-[#f0b7bd]">
                            <span>{code}</span>
                            <button onClick={() => toggleCourse(code)} className="hover:text-[#8a1922]">
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>

        <div className="mt-auto flex justify-end">
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-[#d64045] px-8 py-4 text-lg font-semibold text-white shadow-md transition hover:bg-[#c7343a] disabled:opacity-60"
            >
                {submitting ? "Saving..." : "Continue"}
            </button>
        </div>
      </div>
    </main>
  );
}
