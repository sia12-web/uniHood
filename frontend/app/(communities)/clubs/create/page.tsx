"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clubsApi } from "@/lib/clubs";

export default function CreateClubPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await clubsApi.createClub({ name, description });
            router.push("/clubs");
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string }; status?: number }; message?: string; status?: number };
            console.error("Failed to create club", error);
            // Try to parse error message
            let msg = "Failed to create club. Please try again.";
            if (error?.response?.data?.detail) {
                msg = error.response.data.detail;
            } else if (error?.message) {
                msg = error.message;
            }

            // Customize message for 403
            if (error?.status === 403 || error?.response?.status === 403) {
                msg = "You must be Level 6 (Campus Icon) to create a club.";
            }

            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto max-w-2xl px-4 py-8">
            <Link
                href="/clubs"
                className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                &larr; Back to Clubs
            </Link>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-8">
                <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Create a Club
                </h1>
                <p className="mb-8 text-slate-600 dark:text-slate-400">
                    Start a new community on campus. Note: You must be Level 6 or higher.
                </p>

                {error && (
                    <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Club Name
                        </label>
                        <input
                            id="name"
                            type="text"
                            required
                            maxLength={80}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
                            placeholder="e.g. Hiking Club, Chess Society"
                        />
                    </div>

                    <div>
                        <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Description
                        </label>
                        <textarea
                            id="description"
                            rows={4}
                            maxLength={500}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
                            placeholder="What is this club about? Who should join?"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                        {submitting ? "Creating..." : "Create Club"}
                    </button>
                </form>
            </div>
        </div>
    );
}
