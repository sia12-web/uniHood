"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";


import { listCampuses, patchProfile, reissueAccessToken, type CampusRow } from "@/lib/identity";
import { readAuthSnapshot, storeAuthSnapshot } from "@/lib/auth-storage";

export default function SelectUniversityPage() {
    const [campuses, setCampuses] = useState<CampusRow[]>([]);
    const [selectedCampusId, setSelectedCampusId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
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
                const rows = await listCampuses();
                setCampuses(rows);
                if (rows.length > 0) setSelectedCampusId(rows[0].id);
            } catch (err) {
                console.error("Failed to load campuses", err);
                setError("Unable to load universities.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCampusId) return;
        setSubmitting(true);
        setError(null);
        try {
            const auth = readAuthSnapshot();
            if (!auth?.user_id) {
                router.replace("/login");
                return;
            }
            await patchProfile(auth.user_id, null, { campus_id: selectedCampusId });

			// Re-issue a fresh access token so campus_id claim matches the newly selected campus.
			try {
				const reissued = await reissueAccessToken();
				if (reissued?.access_token) {
					storeAuthSnapshot({
						...(auth ?? {}),
						...reissued,
						token_type: "bearer",
						expires_in: reissued.expires_in ?? auth.expires_in ?? 900,
						stored_at: new Date().toISOString(),
					});
				}
			} catch {
				// Best-effort; user can continue onboarding even if token refresh fails.
			}
            router.push("/major-year");
        } catch (err) {
            console.error(err);
            setError("Failed to save selection.");
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
                        <div className="h-9 w-52 bg-slate-200 rounded-lg animate-pulse mt-6" />
                        <div className="h-5 w-80 bg-slate-100 rounded animate-pulse mt-2" />
                    </div>
                    {/* Skeleton form */}
                    <div className="mt-8 space-y-6">
                        <div className="space-y-2">
                            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                            <div className="h-10 w-full bg-slate-100 rounded-md animate-pulse" />
                        </div>
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
                        Select Your University
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-600">
                        Join your campus community to see what&apos;s happening nearby.
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="campus" className="block text-sm font-medium text-slate-700">
                            University
                        </label>
                        <select
                            id="campus"
                            name="campus"
                            required
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045] sm:text-sm"
                            value={selectedCampusId}
                            onChange={(e) => setSelectedCampusId(e.target.value)}
                        >
                            {campuses.map((campus) => (
                                <option key={campus.id} value={campus.id}>
                                    {campus.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="group relative flex w-full justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-2 text-sm font-medium text-white hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70"
                    >
                        {submitting ? "Saving..." : "Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
