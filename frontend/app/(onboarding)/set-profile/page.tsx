"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot, storeAuthSnapshot } from "@/lib/auth-storage";

export default function SetProfilePage() {
    const [displayName, setDisplayName] = useState("");
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
                setCampusId(profile.campus_id || null);
                setDisplayName(profile.display_name || "");
            } catch (err) {
                console.error("Failed to load profile", err);
                setError("Unable to load profile.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const auth = readAuthSnapshot();
            if (!auth?.user_id) return;

            // Only update display_name. Unused handle is kept internally.
            await patchProfile(auth.user_id, campusId, {
                display_name: displayName,
            });

            // Update the auth snapshot with the new display_name
            storeAuthSnapshot({
                ...auth,
                display_name: displayName,
            });

            router.push("/welcome");
        } catch (err: unknown) {
            console.error(err);
            setError("Failed to update profile.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-md space-y-8">
                    {/* Skeleton header */}
                    <div className="flex flex-col items-center">
                        <div className="h-9 w-40 bg-slate-200 rounded-lg animate-pulse mt-6" />
                        <div className="h-5 w-56 bg-slate-100 rounded animate-pulse mt-2" />
                    </div>
                    {/* Skeleton form */}
                    <div className="mt-8 space-y-6">
                        <div className="space-y-2">
                            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
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
            <div className="w-full max-w-md space-y-8">
                <div className="flex flex-col items-center">
                    <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
                        Set Your Profile
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-600">
                        Choose how you appear to others.
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="displayName" className="block text-sm font-medium text-slate-700">
                            Display Name
                        </label>
                        <input
                            id="displayName"
                            name="displayName"
                            type="text"
                            required
                            maxLength={80}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[#d64045] focus:outline-none focus:ring-[#d64045] sm:text-sm"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="group relative flex w-full justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-2 text-sm font-medium text-white hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70"
                    >
                        {submitting ? "Saving..." : "Finish"}
                    </button>
                </form>
            </div>
        </div>
    );
}
