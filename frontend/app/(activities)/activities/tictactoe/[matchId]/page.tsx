"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { useTicTacToeSession } from '@/app/features/activities/hooks/useTicTacToeSession';
import { TicTacToeBoard } from '@/app/features/activities/components/TicTacToeBoard';

export default function TicTacToePage() {
    const params = useParams();
    const matchId = params.matchId as string;
    const { state, makeMove, restartGame, toggleReady } = useTicTacToeSession(matchId);

    return (
        <main className="min-h-screen bg-[#0c0b16] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.1),transparent_50%)]" />
            <TicTacToeBoard state={state} onMove={makeMove} onRestart={restartGame} onToggleReady={toggleReady} />
        </main>
    );
}
