'use client';

import Link from 'next/link';
import { Gamepad2, Keyboard, Brain, Hand, BookOpen, Play } from 'lucide-react';

// Game invite message format: 🎮 GAME_INVITE::{gameKey}::{sessionId}::{gameName}
const GAME_INVITE_PREFIX = '🎮 GAME_INVITE::';

export type GameKey = 'tictactoe' | 'speed_typing' | 'quick_trivia' | 'rock_paper_scissors' | 'story_builder';

interface ParsedGameInvite {
    gameKey: GameKey;
    sessionId: string;
    gameName: string;
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

    const [gameKey, sessionId, gameName] = parts;

    if (!gameKey || !sessionId || !gameName) {
        return null;
    }

    return {
        gameKey: gameKey as GameKey,
        sessionId,
        gameName,
    };
}

export function formatGameInviteMessage(gameKey: GameKey, sessionId: string, gameName: string): string {
    return `${GAME_INVITE_PREFIX}${gameKey}::${sessionId}::${gameName}`;
}

interface GameInviteCardProps {
    body: string;
    isSelf: boolean;
}

export function GameInviteCard({ body, isSelf }: GameInviteCardProps) {
    const invite = parseGameInvite(body);

    if (!invite) {
        return <span>{body}</span>;
    }

    const { gameKey, sessionId, gameName } = invite;
    const colors = GAME_COLORS[gameKey] || GAME_COLORS.tictactoe;
    const icon = GAME_ICONS[gameKey] || GAME_ICONS.tictactoe;
    const route = GAME_ROUTES[gameKey] || GAME_ROUTES.tictactoe;

    const gameUrl = `${route}?session=${sessionId}`;

    return (
        <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-4 max-w-xs`}>
            <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ${colors.text}`}>
                    {icon}
                </div>
                <div>
                    <div className="font-semibold text-slate-900">{gameName}</div>
                    <div className="text-xs text-slate-500">
                        {isSelf ? 'You sent a game invite' : 'Game invite'}
                    </div>
                </div>
            </div>

            <Link
                href={gameUrl}
                className={`flex items-center justify-center gap-2 w-full rounded-xl ${colors.text} bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:shadow-md transition-all border ${colors.border}`}
            >
                <Play className="h-4 w-4" />
                Join Game
            </Link>
        </div>
    );
}
