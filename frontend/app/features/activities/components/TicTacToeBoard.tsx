import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { TicTacToeState } from '../hooks/useTicTacToeSession';
import { Copy, Check, RotateCcw } from 'lucide-react';

interface BoardProps {
    state: TicTacToeState;
    onMove: (index: number) => void;
    onRestart: () => void;
    onToggleReady: () => void;
    playerNames?: Record<string, string>;
}

export const TicTacToeBoard: React.FC<BoardProps> = ({ state, onMove, onRestart, onToggleReady, playerNames }) => {
    const { board, turn, myRole, connected, status, players, ready, scores, roundWins, countdown, winner, error, lastRoundWinner, roundIndex, matchWinner } = state;
    const isMyTurn = myRole === turn && status === 'playing';
    const canPlay = connected && status === 'playing' && isMyTurn;
    const [copied, setCopied] = useState(false);

    const copyInvite = () => {
        if (typeof window !== 'undefined') {
            const url = `${window.location.origin}/activities?matchId=${new URLSearchParams(window.location.search).get('matchId')}`;
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const roundNumber = typeof roundIndex === 'number' ? roundIndex : null;
    const lastWinnerId = lastRoundWinner || null;
    const resolveName = (userId?: string) => {
        if (!userId) return "Opponent";
        if (playerNames && playerNames[userId]) return playerNames[userId];
        return userId.slice(0, 6);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 w-full max-w-4xl mx-auto">
            {/* Header / Scoreboard */}
            <div className="flex items-center justify-between w-full px-6 py-4 bg-slate-800/50 rounded-2xl backdrop-blur-sm border border-slate-700/50 shadow-lg">
                <div className={clsx("flex items-center gap-4 px-6 py-3 rounded-xl transition-colors", turn === 'X' && status === 'playing' ? "bg-cyan-500/20 border border-cyan-500/50" : "")}>
                    <div className="text-cyan-400 font-bold text-2xl">X</div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Player X</span>
                        <span className="text-white font-mono text-lg">
                            {status === 'finished' ? (scores[players.X || ''] || 0) : (roundWins?.[players.X || ''] || 0)}
                        </span>
                    </div>
                    {players.X && ready[players.X] && status === 'lobby' && <Check className="w-5 h-5 text-green-400" />}
                </div>

                <div className="text-slate-600 font-mono text-lg font-bold">VS</div>

                <div className={clsx("flex items-center gap-4 px-6 py-3 rounded-xl transition-colors", turn === 'O' && status === 'playing' ? "bg-pink-500/20 border border-pink-500/50" : "")}>
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Player O</span>
                        <span className="text-white font-mono text-lg">
                            {status === 'finished' ? (scores[players.O || ''] || 0) : (roundWins?.[players.O || ''] || 0)}
                        </span>
                    </div>
                    <div className="text-pink-400 font-bold text-2xl">O</div>
                    {players.O && ready[players.O] && status === 'lobby' && <Check className="w-5 h-5 text-green-400" />}
                </div>
            </div>

            {/* Game Area */}
            <div className="relative">
                {/* Board */}
                <div className={clsx("grid grid-cols-3 gap-3 p-6 bg-slate-800/50 rounded-2xl backdrop-blur-sm border border-slate-700/50 shadow-2xl transition-opacity duration-500", status !== 'playing' && status !== 'finished' && "opacity-50 blur-sm pointer-events-none")}>
                    {board.map((cell, index) => (
                        <motion.button
                            key={index}
                            whileHover={!cell && canPlay ? { scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" } : {}}
                            whileTap={!cell && canPlay ? { scale: 0.98 } : {}}
                            onClick={() => canPlay && !cell && onMove(index)}
                            disabled={!!cell || !canPlay}
                            className={clsx(
                                "w-32 h-32 sm:w-40 sm:h-40 rounded-xl flex items-center justify-center text-6xl relative overflow-hidden transition-colors",
                                "bg-slate-900/80 border-2 border-slate-700/50",
                                !cell && canPlay && "cursor-pointer hover:border-slate-500",
                                !cell && !canPlay && "cursor-default opacity-80"
                            )}
                        >
                            {cell === 'X' && (
                                <motion.svg initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3 }} viewBox="0 0 100 100" className="w-20 h-20 sm:w-24 sm:h-24 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
                                    <path d="M25 25 L75 75 M75 25 L25 75" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                                </motion.svg>
                            )}
                            {cell === 'O' && (
                                <motion.svg initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3 }} viewBox="0 0 100 100" className="w-20 h-20 sm:w-24 sm:h-24 text-pink-400 drop-shadow-[0_0_15px_rgba(244,114,182,0.6)]">
                                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                                </motion.svg>
                            )}
                        </motion.button>
                    ))}
                </div>

                {/* Overlays */}
                <AnimatePresence>
                    {status === 'lobby' && (
                        <motion.div
                            key="lobby"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10"
                        >
                            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-700 shadow-xl flex flex-col items-center gap-6 max-w-md text-center backdrop-blur-md">
                                <h2 className="text-3xl font-bold text-white">Waiting for Players</h2>
                                <p className="text-slate-400 text-base">Invite a friend to play or wait for someone to join.</p>
                                {lastWinnerId && roundNumber !== null && roundNumber > 0 && (
                                    <div className="w-full rounded-xl border border-slate-700 bg-slate-800/70 p-4 text-sm text-slate-200">
                                        {lastWinnerId === players[myRole || '']
                                            ? `You won round ${roundNumber}!`
                                            : `${resolveName(lastWinnerId)} won round ${roundNumber}.`}
                                    </div>
                                )}

                                <button
                                    onClick={copyInvite}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors text-base w-full justify-center border border-slate-700"
                                >
                                    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                                    {copied ? "Link Copied!" : "Copy Invite Link"}
                                </button>

                                <div className="w-full h-px bg-slate-700 my-2" />

                                <button
                    onClick={onToggleReady}
                    className={clsx(
                        "w-full px-8 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2",
                        myRole && myRole !== 'spectator' && ready[players[myRole] || '']
                            ? "bg-green-500/20 text-green-400 border border-green-500/50"
                            : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg"
                    )}
                >
                    {myRole && myRole !== 'spectator' && ready[players[myRole] || ''] ? "Ready!" : "I'm Ready"}
                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'countdown' && (
                        <motion.div
                            key="countdown"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.5 }}
                            className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                        >
                            <div className="text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)] animate-pulse">
                                {countdown}
                            </div>
                        </motion.div>
                    )}

                    {status === 'finished' && winner && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute inset-0 flex items-center justify-center z-10"
                        >
                            <div className="bg-slate-900/95 p-8 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center gap-6 text-center backdrop-blur-md">
                                <h2 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
                                    {winner === 'draw' ? "It's a Draw!" : `${playerNames?.[players[winner as 'X' | 'O'] || ''] || `Player ${winner}`} Wins!`}
                                </h2>
                                <div className="flex gap-4">
                                    <button
                                        onClick={onRestart}
                                        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-bold rounded-full hover:bg-slate-200 transition-colors shadow-lg"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Play Again
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {!connected && !error && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="text-white text-xl font-mono animate-pulse">Connecting...</div>
                </div>
            )}

            {error && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur">
                    <div className="bg-slate-900 border border-red-500/40 shadow-2xl rounded-2xl p-8 max-w-md w-full text-center space-y-4">
                        <h3 className="text-2xl font-semibold text-red-300">Unable to reach Tic-Tac-Toe server</h3>
                        <p className="text-slate-300 text-sm">
                            {error === 'unresolved_socket'
                                ? 'Set NEXT_PUBLIC_ACTIVITIES_CORE_URL in frontend/.env.local and restart the dev server.'
                                : 'Check that the activities-core service is running and reachable, then try again.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 rounded-lg bg-gradient-to-r from-red-400 to-pink-500 text-white font-semibold shadow-lg hover:opacity-90"
                        >
                            Retry Connection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
