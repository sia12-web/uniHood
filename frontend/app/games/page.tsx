"use client";

import Link from "next/link";
import { useActivitySnapshot } from "@/hooks/use-activity-snapshot";
import { useStoryInviteState } from "@/components/providers/story-invite-provider";
import { useTypingDuelInviteState } from "@/components/providers/typing-duel-invite-provider";
import { useTicTacToeInviteState } from "@/components/providers/tictactoe-invite-provider";
import { useQuickTriviaInviteState } from "@/components/providers/quick-trivia-invite-provider";
import { useRockPaperScissorsInviteState } from "@/components/providers/rock-paper-scissors-invite-provider";

const activityPreviews = [
    {
        key: "speed_typing",
        title: "Speed Typing Duel",
        description: "Race head-to-head to finish the sample with accuracy.",
        href: "/activities/speed_typing",
        image: "/activities/speedtyping.svg",
    },
    {
        key: "quick_trivia",
        title: "Quick Trivia",
        description: "Rapid questions. Earn points for correctness and speed.",
        href: "/activities/quick_trivia",
        image: "/activities/trivia.svg",
    },
    {
        key: "rps",
        title: "Rock / Paper / Scissors",
        description: "Real-time duel game used in earlier calibration labs.",
        href: "/activities/rock_paper_scissors",
        image: "/activities/rps.svg",
    },
    {
        key: "story",
        title: "Story Builder",
        description: "Collaborative romance story. You write one part, they write the next.",
        href: "/activities/story",
        image: "/activities/story.svg",
    },
    {
        key: "tictactoe",
        title: "Tic Tac Toe",
        description: "The classic game of X's and O's. Challenge a friend.",
        href: "/activities/tictactoe",
        image: "/activities/tictactoe.svg",
    },
];

export default function GamesPage() {
    const activitySnapshot = useActivitySnapshot();

    const { hasPending: hasStoryInvite, dismissLatest: dismissStory } = useStoryInviteState();
    const { hasPending: hasTypingInvite, dismissLatest: dismissTyping } = useTypingDuelInviteState();
    const { hasPending: hasTicTacToeInvite, dismissLatest: dismissTicTacToe } = useTicTacToeInviteState();
    const { hasPending: hasQuickTriviaInvite, dismissLatest: dismissQuickTrivia } = useQuickTriviaInviteState();
    const { hasPending: hasRPSInvite, dismissLatest: dismissRPS } = useRockPaperScissorsInviteState();

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
            <div className="mx-auto max-w-6xl space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Play Games</h1>
                    <p className="text-slate-600">Challenge yourself and friends to earn points.</p>
                </div>

                {/* Minimal Stats Row */}
                <div className="flex w-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-around text-center">
                    {/* Game Points */}
                    <div className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                            {activitySnapshot.loading || !activitySnapshot.available
                                ? "-"
                                : (activitySnapshot.totalGames * 50) + (activitySnapshot.wins * 150)}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Game Points</span>
                    </div>

                    <div className="hidden h-12 w-px bg-slate-100 md:block" />

                    {/* Games Played */}
                    <div className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                            {activitySnapshot.loading || !activitySnapshot.available ? "-" : activitySnapshot.totalGames}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Played</span>
                    </div>

                    <div className="hidden h-12 w-px bg-slate-100 md:block" />

                    {/* Wins */}
                    <div className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-3xl font-extrabold tracking-tight text-slate-900">
                            {activitySnapshot.loading || !activitySnapshot.available ? "-" : activitySnapshot.wins}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Wins</span>
                    </div>
                </div>

                {/* Games Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {activityPreviews.map((game) => {
                        const highlight =
                            (game.key === "speed_typing" && hasTypingInvite) ||
                            (game.key === "story" && hasStoryInvite) ||
                            (game.key === "tictactoe" && hasTicTacToeInvite) ||
                            (game.key === "quick_trivia" && hasQuickTriviaInvite) ||
                            (game.key === "rps" && hasRPSInvite);
                        return (
                            <Link
                                key={game.key}
                                href={game.href}
                                className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#191b2c] bg-gradient-to-br from-[#1f2336] via-[#14182b] to-[#070910] text-white shadow-[0_15px_40px_rgba(7,9,16,0.3)] transition hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(7,9,16,0.5)]"
                            >
                                <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                                    <span className="flex gap-1">
                                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                                    </span>
                                    <span>Play</span>
                                </div>
                                <div
                                    className="relative h-48 overflow-hidden"
                                    style={
                                        game.image
                                            ? {
                                                backgroundImage: `linear-gradient(120deg, rgba(255,255,255,0.05), rgba(6,7,15,0.92)), url(${game.image})`,
                                                backgroundSize: "cover",
                                                backgroundPosition: "center",
                                            }
                                            : undefined
                                    }
                                >
                                    {game.image ? <div className="absolute inset-0 bg-gradient-to-t from-[#04060f] via-transparent to-transparent" /> : null}
                                </div>
                                <div className="flex flex-1 flex-col gap-3 px-5 py-5">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">{game.title}</h3>
                                        <p className="text-sm text-white/70">{game.description}</p>
                                    </div>

                                    <div className="mt-auto pt-2 flex gap-2">
                                        <span className={`inline-flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition ${highlight ? "bg-emerald-500 shadow-emerald-500/30 group-hover:bg-emerald-600" : "bg-rose-600 shadow-rose-600/30 group-hover:bg-rose-700"}`}>
                                            {highlight ? "Join pending session" : "Play Now"}
                                        </span>
                                        {highlight && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (game.key === "story") dismissStory();
                                                    if (game.key === "speed_typing") dismissTyping();
                                                    if (game.key === "tictactoe") dismissTicTacToe();
                                                    if (game.key === "quick_trivia") dismissQuickTrivia();
                                                    if (game.key === "rps") dismissRPS();
                                                }}
                                                className="inline-flex items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                                            >
                                                Dismiss
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
