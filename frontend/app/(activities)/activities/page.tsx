"use client";

import React, { useState, useEffect } from 'react';
import { useTicTacToeSession } from '@/app/features/activities/hooks/useTicTacToeSession';
import { TicTacToeBoard } from '@/app/features/activities/components/TicTacToeBoard';

export default function ActivitiesPage() {
    const [matchId, setMatchId] = useState<string>("");

    useEffect(() => {
        // Generate a random match ID for the preview session
        setMatchId(Math.random().toString(36).substring(7));
    }, []);

    const { state, makeMove, restartGame } = useTicTacToeSession(matchId);

    if (!matchId) {
        return (
            <main className="min-h-screen bg-[#0c0b16] flex items-center justify-center p-4 relative overflow-hidden">
                <div className="text-white">Loading preview...</div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#0c0b16] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.1),transparent_50%)]" />
            <TicTacToeBoard state={state} onMove={makeMove} onRestart={restartGame} />
        </main>
    );
}
