'use client';

import Link from 'next/link';
import { Gamepad2, Keyboard, Brain, Hand, BookOpen, Play, Clock, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

// Game invite message format: 🎮 GAME_INVITE::{gameKey}::{sessionId}::{gameName}::{createdAt}
// Note: createdAt is optional for backward compatibility
const GAME_INVITE_PREFIX = '🎮 GAME_INVITE::';

// Session expires after 30 minutes
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

export type GameKey = 'tictactoe' | 'speed_typing' | 'quick_trivia' | 'rock_paper_scissors' | 'story_builder';

interface ParsedGameInvite {
    gameKey: GameKey;
    sessionId: string;
    gameName: string;
    createdAt?: number;
}

const GAME_ICONS: Record<GameKey, React.ReactNode> = {
    tictactoe: <Gamepad2 className="h-5 w-5" />,
    speed_typing: <Keyboard className="h-5 w-5" />,
    quick_trivia: <Brain className="h-5 w-5" />,
    rock_paper_scissors: <Hand className="h-5 w-5" />,
    story_builder: <BookOpen className="h-5 w-5" />,
};

const GAME_COLORS: Record<GameKey, { bg: string; text: string; border: string }> = {
    tictactoe: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
    speed_typing: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    quick_trivia: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    rock_paper_scissors: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
    story_builder: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
};

const GAME_ROUTES: Record<GameKey, string> = {
    tictactoe: '/activities/tictactoe',
    speed_typing: '/activities/speed_typing',
    quick_trivia: '/activities/quick_trivia',
    rock_paper_scissors: '/activities/rock_paper_scissors',
    story_builder: '/activities/story',
};

export function isGameInviteMessage(body: string): boolean {
    return body.startsWith(GAME_INVITE_PREFIX);
}

export function parseGameInvite(body: string): ParsedGameInvite | null {
    if (!isGameInviteMessage(body)) {
        return null;
    }

    const content = body.slice(GAME_INVITE_PREFIX.length);
    const parts = content.split('::');

    if (parts.length < 3) {
        return null;
    }

    const [gameKey, sessionId, gameName, createdAtStr] = parts;

    if (!gameKey || !sessionId || !gameName) {
        return null;
    }

    // Parse createdAt if present
    const createdAt = createdAtStr ? parseInt(createdAtStr, 10) : undefined;

    return {
        gameKey: gameKey as GameKey,
        sessionId,
        gameName,
        createdAt: createdAt && !isNaN(createdAt) ? createdAt : undefined,
    };
}

export function formatGameInviteMessage(gameKey: GameKey, sessionId: string, gameName: string): string {
    const createdAt = Date.now();
    return `${GAME_INVITE_PREFIX}${gameKey}::${sessionId}::${gameName}::${createdAt}`;
}

interface GameInviteCardProps {
    body: string;
    isSelf: boolean;
}

function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return 'Expired';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) {
        return `${minutes}m ${seconds}s left`;
    }
    return `${seconds}s left`;
}

export function GameInviteCard({ body, isSelf }: GameInviteCardProps) {
    const invite = parseGameInvite(body);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    useEffect(() => {
        if (!invite?.createdAt) {
            setTimeRemaining(null);
            return;
        }

        const updateTimer = () => {
            const expiresAt = invite.createdAt! + SESSION_EXPIRY_MS;
            const remaining = expiresAt - Date.now();
            setTimeRemaining(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [invite?.createdAt]);

    if (!invite) {
        return <span>{body}</span>;
    }

    const { gameKey, sessionId, gameName, createdAt } = invite;
    const colors = GAME_COLORS[gameKey] || GAME_COLORS.tictactoe;
    const icon = GAME_ICONS[gameKey] || GAME_ICONS.tictactoe;
    const route = GAME_ROUTES[gameKey] || GAME_ROUTES.tictactoe;

    const gameUrl = `${route}?session=${sessionId}`;
    const isExpired = timeRemaining !== null && timeRemaining <= 0;
    const isUrgent = timeRemaining !== null && timeRemaining > 0 && timeRemaining < 5 * 60 * 1000; // < 5 min

    return (
        <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4 max-w-xs ${isExpired ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ${colors.text}`}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900">{gameName}</div>
                    <div className="text-xs text-slate-500">
                        {isSelf ? 'You sent a game invite' : 'Game invite'}
                    </div>
                </div>
            </div>

            {/* Expiration timer */}
            {createdAt && (
                <div className={`flex items-center gap-1.5 mb-3 text-xs ${isExpired ? 'text-rose-600' : isUrgent ? 'text-amber-600' : 'text-slate-500'}`}>
                    {isExpired ? (
                        <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                        <Clock className="h-3.5 w-3.5" />
                    )}
                    <span>{timeRemaining !== null ? formatTimeRemaining(timeRemaining) : 'Calculating...'}</span>
                </div>
            )}

            {isExpired ? (
                <div className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400 border border-slate-200">
                    <AlertCircle className="h-4 w-4" />
                    Session Expired
                </div>
            ) : (
                <Link
                    href={gameUrl}
                    className={`flex items-center justify-center gap-2 w-full rounded-xl ${colors.text} bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:shadow-md transition-all border ${colors.border}`}
                >
                    <Play className="h-4 w-4" />
                    Join Game
                </Link>
            )}
        </div>
    );
}
