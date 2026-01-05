"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClubDetail, clubsApi } from "@/lib/clubs";

export default function ClubDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [club, setClub] = useState<ClubDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false); // Simple state to track join for now

    useEffect(() => {
        async function loadClub() {
            try {
                const data = await clubsApi.getClub(id);
                setClub(data);
            } catch (err) {
                console.error("Failed to load club", err);
                setError("Failed to load club details.");
            } finally {
                setLoading(false);
            }
        }
        if (id) {
            loadClub();
        }
    }, [id]);

    const handleJoin = async () => {
        if (!club) return;
        setJoining(true);
        try {
            await clubsApi.joinClub(club.id);
            setJoined(true);
            // Optionally reload club to update member count
            const updated = await clubsApi.getClub(club.id);
            setClub(updated);
        } catch (err) {
            console.error("Failed to join club", err);
            alert("Failed to join club. You might already be a member.");
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return <div className="p-12 text-center">Loading club...</div>;
    }

    if (error || !club) {
        return (
            <div className="container mx-auto max-w-2xl px-4 py-12 text-center">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Club Not Found</h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">{error || "This club does not exist."}</p>
                <Link href="/clubs" className="mt-6 inline-block text-blue-600 hover:underline">
                    Back to Clubs
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <Link
                href="/clubs"
                className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                &larr; Back to Clubs
            </Link>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="h-32 bg-slate-100 dark:bg-slate-900 sm:h-48 relative">
                    {/* Placeholder cover */}
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300 dark:text-slate-800">
                        <span className="text-6xl">🏫</span>
                    </div>
                </div>

                <div className="px-6 pb-8 pt-6 sm:px-8">
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                                {club.name}
                            </h1>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Founded {new Date(club.created_at).toLocaleDateString()}
                            </p>
                        </div>

                        {!joined && (
                            <button
                                onClick={handleJoin}
                                disabled={joining}
                                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                            >
                                {joining ? "Joining..." : "Join Club"}
                            </button>
                        )}
                        {joined && (
                            <button
                                disabled
                                className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-2.5 text-sm font-medium text-slate-500 cursor-default dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                            >
                                Member
                            </button>
                        )}
                    </div>

                    <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-900">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">About</h2>
                        <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-600 dark:text-slate-400">
                            {club.description || "No description provided."}
                        </p>
                    </div>

                    <div className="mt-8 flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{club.member_count}</span> Members
                        </div>
                        {/* Add more stats or info here */}
                    </div>
                </div>
            </div>
        </div>
    );
}
