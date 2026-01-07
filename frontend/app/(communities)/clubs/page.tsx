"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Club, clubsApi } from "@/lib/clubs";
import ClubCard from "@/app/features/clubs/components/ClubCard";
import { useActivitySnapshot } from "@/hooks/use-activity-snapshot";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ClubsPage() {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { level } = useActivitySnapshot();
    const isLocked = (level ?? 1) < 6;

    useEffect(() => {
        async function loadClubs() {
            try {
                const data = await clubsApi.listClubs();
                setClubs(data);
            } catch (err) {
                console.error("Failed to load clubs", err);
                setError("Failed to load clubs. Please try again.");
            } finally {
                setLoading(false);
            }
        }
        loadClubs();
    }, []);

    return (
        <div className="container mx-auto max-w-5xl px-4 py-8">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        Student Clubs
                    </h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400">
                        Discover and join clubs on campus, or start your own.
                    </p>
                </div>
                <Link
                    href={isLocked ? "#" : "/clubs/create"}
                    className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                        isLocked
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    )}
                    onClick={(e) => {
                        if (isLocked) {
                            e.preventDefault();
                            alert("You must be Level 6 (Campus Icon) to create a club.");
                        }
                    }}
                >
                    {isLocked && <Lock size={14} />}
                    Create Club
                    {isLocked && <span className="ml-1 text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">Lvl 6</span>}
                </Link>
            </div>

            {loading ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
            ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                    {error}
                </div>
            ) : clubs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No clubs found</h3>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Be the first to create a club on campus!</p>
                    <Link
                        href="/clubs/create"
                        className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                    >
                        Create a Club &rarr;
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {clubs.map((club) => (
                        <ClubCard key={club.id} club={club} />
                    ))}
                </div>
            )}
        </div>
    );
}
