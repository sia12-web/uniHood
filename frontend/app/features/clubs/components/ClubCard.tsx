"use client";

import Link from "next/link";
import { Club } from "@/lib/clubs";

interface ClubCardProps {
    club: Club;
}

export default function ClubCard({ club }: ClubCardProps) {
    return (
        <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="line-clamp-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {club.name}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    {club.member_count} members
                </span>
            </div>

            <p className="mb-4 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                {club.description || "No description provided."}
            </p>

            <div className="mt-auto">
                <Link
                    href={`/clubs/${club.id}`}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                >
                    View Club
                </Link>
            </div>
        </div>
    );
}
