import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import type { GameSession, PlayerRole } from '../types';
import { Board } from '../components/Board';
import { TurnIndicator } from '../components/TurnIndicator';
import { ResultBanner } from '../components/ResultBanner';
import { motion, AnimatePresence } from 'framer-motion';

export const Game: React.FC = () => {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const [session, setSession] = useState<GameSession | null>(null);
    const [error, setError] = useState<string | null>(null);

    const playerId = localStorage.getItem('playerId');
    const myRole = localStorage.getItem('role') as PlayerRole | null;

    useEffect(() => {
        if (!code || !playerId) {
            navigate('/');
            return;
        }

        // Connect socket
        socket.connect();

        // Join game
        // We need sessionId. But we only have code in URL.
        // We should probably fetch session details first via API or just emit join with code?
        // Our socket event expects sessionId.
        // Let's fetch session by code first to get ID.

        const fetchSession = async () => {
            try {
                const res = await fetch(`http://localhost:3000/sessions/${code}`);
                if (!res.ok) throw new Error('Session not found');
                const data = await res.json();
                setSession(data);

                socket.emit('join_game', { sessionId: data.id, playerId });
            } catch (err) {
                setError('Session not found');
            }
        };

        fetchSession();

        socket.on('game_update', (updatedSession: GameSession) => {
            setSession(updatedSession);
        });

        socket.on('error', (err: { message: string }) => {
            console.error('Socket error:', err);
            // alert(err.message); // Optional: show toast
        });

        return () => {
            socket.off('game_update');
            socket.off('error');
            socket.disconnect();
        };
    }, [code, playerId, navigate]);

    const handleMove = (index: number) => {
        if (!session || !playerId) return;
        socket.emit('make_move', { sessionId: session.id, playerId, index });
    };

    const handleRematch = () => {
        if (!session || !playerId) return;
        socket.emit('request_rematch', { sessionId: session.id, playerId });
    };

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4 text-red-500">{error}</h2>
                    <button onClick={() => navigate('/')} className="px-4 py-2 bg-slate-800 rounded">Go Home</button>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="animate-pulse text-cyan-400 font-mono">Loading...</div>
            </div>
        );
    }

    const isWaiting = session.status === 'waiting';

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

            {/* Header Info */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
                <div className="bg-slate-900/50 backdrop-blur px-4 py-2 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-xs uppercase tracking-wider block">Room Code</span>
                    <span className="font-mono text-xl font-bold tracking-widest text-white">{session.code}</span>
                </div>

                <button
                    onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        // Show toast
                    }}
                    className="text-xs text-slate-500 hover:text-white transition-colors"
                >
                    Share Link
                </button>
            </div>

            <AnimatePresence mode="wait">
                {isWaiting ? (
                    <motion.div
                        key="waiting"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="text-center space-y-6 z-10"
                    >
                        <div className="w-24 h-24 mx-auto border-4 border-t-cyan-500 border-r-fuchsia-500 border-b-purple-500 border-l-indigo-500 rounded-full animate-spin" />
                        <h2 className="text-3xl font-bold">Waiting for Opponent...</h2>
                        <p className="text-slate-400">Share the code <span className="font-mono text-white bg-slate-800 px-2 py-1 rounded">{session.code}</span></p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="game"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full max-w-md flex flex-col items-center z-10"
                    >
                        <TurnIndicator turn={session.turn} myRole={myRole} status={session.status} />

                        <div className="relative">
                            <Board
                                board={session.board}
                                onMove={handleMove}
                                myRole={myRole}
                                isMyTurn={session.turn === myRole}
                                winningLine={session.winningLine}
                            />

                            <AnimatePresence>
                                {session.status === 'finished' && (
                                    <ResultBanner winner={session.winner} onRematch={handleRematch} />
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
