"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClubDetail, clubsApi, ClubMeetup } from "@/lib/clubs";
import { Share, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ClubDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const { push } = useToast();
    const [club, setClub] = useState<ClubDetail | null>(null);
    const [meetups, setMeetups] = useState<ClubMeetup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false); // Refine this with actual API check if possible or assume from detail?

    useEffect(() => {
        async function loadClub() {
            try {
                const data = await clubsApi.getClub(id);
                setClub(data);

                // Fetch meetups
                const clubMeetups = await clubsApi.getClubMeetups(id);
                setMeetups(clubMeetups);

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
            push({ title: `Joined ${club.name}!`, description: "+50 XP", variant: "success" });

            // Reload to update count
            const updated = await clubsApi.getClub(club.id);
            setClub(updated);
        } catch (err) {
            console.error("Failed to join club", err);
            push({ title: "Failed to join club", description: "Unknown error", variant: "error" });
        } finally {
            setJoining(false);
        }
    };

    const handleLeave = async () => {
        if (!club) return;
        if (!confirm("Are you sure you want to leave this club? You will lose 50 XP.")) return;

        setJoining(true); // Reuse loading state
        try {
            await clubsApi.leaveClub(club.id);
            setJoined(false);
            push({ title: `Left ${club.name}`, description: "-50 XP", variant: "default" });
            // Reload to update count
            const updated = await clubsApi.getClub(club.id);
            setClub(updated);
        } catch (err) {
            console.error("Failed to leave club", err);
            push({ title: "Failed to leave club.", description: "Unknown error", variant: "error" });
        } finally {
            setJoining(false);
        }
    };

    const handleInvite = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        push({ title: "Link copied!", description: "Share it with your friends.", variant: "success" });
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
        <div className="container mx-auto max-w-5xl px-4 py-8">
            <Link
                href="/clubs"
                className="mb-6 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                &larr; Back to Clubs
            </Link>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="h-32 bg-slate-100 dark:bg-slate-900 sm:h-48 relative">
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

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleInvite}
                                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <Share size={16} />
                                Invite
                            </button>

                            {!joined ? (
                                <button
                                    onClick={handleJoin}
                                    disabled={joining}
                                    className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                                >
                                    {joining ? "Joining..." : "Join Club"}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-2.5 text-sm font-medium text-slate-500 cursor-default dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                                    >
                                        Member
                                    </button>
                                    <button
                                        onClick={handleLeave}
                                        disabled={joining}
                                        className="rounded-lg text-red-600 px-3 py-2 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                        Leave
                                    </button>
                                </div>
                            )}
                        </div>
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
                    </div>
                </div>
            </div>

            {/* Club Meetups Section */}
            <div className="mt-10">
                <div className="flex items-center gap-2 mb-6">
                    <Calendar className="text-blue-600 dark:text-blue-400" size={24} />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Club Meetups</h2>
                </div>

                {meetups.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {meetups.map((meetup) => (
                            <div key={meetup.id} className="border p-4 rounded-xl dark:border-slate-800 bg-white dark:bg-slate-950">
                                {/* Simple Inline Card or use MeetupCard component if accessible */}
                                <h3 className="font-bold text-lg mb-1">{meetup.title}</h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    {new Date(meetup.start_at).toLocaleDateString()} at {new Date(meetup.start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </p>
                                <Link
                                    href={`/meetups/${meetup.id}`}
                                    className="text-sm text-blue-600 hover:underline"
                                >
                                    View Details &rarr;
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="text-4xl mb-3">📅</div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No meetups scheduled</h3>
                        <p className="text-slate-500 mt-1 mb-4">This club hasn&apos;t scheduled any meetups yet.</p>
                        {/* Optionally allow creation if user is member/owner */}
                    </div>
                )}
            </div>
        </div>
    );
}
