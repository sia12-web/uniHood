"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sword } from "lucide-react";
import { AnimeCharacter, AnimeState } from "./AnimeCharacter";
import { RockPaperScissorsState, RpsChoice } from "../hooks/useRockPaperScissorsSession";

interface AnimeDuelArenaProps {
    state: RockPaperScissorsState;
    selfUserId: string;
    opponentUserId?: string;
    submitMove: (move: RpsChoice) => void;
    onRestart?: () => void;
}

export const AnimeDuelArena: React.FC<AnimeDuelArenaProps> = ({
    state,
    selfUserId,
    opponentUserId,
    submitMove,
    onRestart,
}) => {
    const [myAnimState, setMyAnimState] = useState<AnimeState>("idle");
    const [oppAnimState, setOppAnimState] = useState<AnimeState>("idle");

    // Derived state
    const isCountdown = state.phase === "countdown";
    const isRunning = state.phase === "running";
    const isEnded = state.phase === "ended";

    // Last round info
    const lastRoundMoves = state.lastRoundMoves;
    const lastRoundWinner = state.lastRoundWinner;

    // Effect to manage animation states
    useEffect(() => {
        if (isCountdown) {
            setMyAnimState("countdown");
            setOppAnimState("countdown");
            return;
        }

        if (isRunning) {
            if (lastRoundMoves && !state.submittedMove) {
                // Round just finished (or we are in between rounds viewing results)
                // Check if we are momentarily showing the "Reveal"
                // Actually, the hook clears lastRoundMoves after a delay? 
                // No, the hook clears it when round starts.

                // We need a local effect to trigger the sequence: Reveal -> Result -> Idle
                // But since we receive "lastRoundMoves" only when round ends, we can use that.

                // Find moves
                const myPlayed = lastRoundMoves.find(m => m.userId === selfUserId)?.move;
                const oppPlayed = lastRoundMoves.find(m => m.userId === opponentUserId)?.move;

                if (myPlayed && oppPlayed) {
                    // Reveal Phase
                    setMyAnimState(myPlayed as AnimeState);
                    setOppAnimState(oppPlayed as AnimeState);

                    // After delay, show Win/Lose
                    const timer = setTimeout(() => {
                        if (lastRoundWinner === selfUserId) {
                            setMyAnimState("win");
                            setOppAnimState("lose");
                        } else if (lastRoundWinner === opponentUserId) {
                            setMyAnimState("lose");
                            setOppAnimState("win");
                        } else {
                            // Draw - maybe use Idle or a specific "Draw" pose (reusing idle for now)
                            setMyAnimState("idle");
                            setOppAnimState("idle");
                        }
                    }, 2500); // Increased from 1500 to 2500

                    return () => clearTimeout(timer);
                }
            }

            // Default Running State
            if (state.submittedMove) {
                setMyAnimState("countdown"); // Tense waiting
            } else {
                setMyAnimState("idle");
            }
            setOppAnimState("idle"); // We don't verify if opponent submitted to avoid cheating hints
            return;
        }

        if (isEnded) {
            // Final Game Result
            if (state.winnerUserId === selfUserId) {
                setMyAnimState("win");
                setOppAnimState("lose");
            } else if (state.winnerUserId && state.winnerUserId !== selfUserId) {
                setMyAnimState("lose");
                setOppAnimState("win");
            } else {
                setMyAnimState("idle");
                setOppAnimState("idle");
            }
        }

    }, [state.phase, state.submittedMove, state.winnerUserId, lastRoundMoves, lastRoundWinner, selfUserId, opponentUserId, isCountdown, isEnded, isRunning]);

    return (
        <div className="relative w-full max-w-4xl mx-auto h-[600px] overflow-hidden rounded-3xl bg-slate-900 border-4 border-indigo-900 shadow-2xl">
            {/* Background Anime Speed Lines / Gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-950 to-black opacity-80" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>

            {/* Arena Content */}
            <div className="relative z-10 flex h-full justify-between px-8 pt-20 pb-32">
                {/* Left: Player (You) */}
                <div className="flex flex-col items-center justify-end">
                    <div className="relative">
                        <AnimeCharacter state={myAnimState} className="w-64 h-64 md:w-80 md:h-80" />
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center w-full">
                            <span className="block text-white font-black text-xl tracking-widest uppercase drop-shadow-lg">You</span>
                        </div>
                    </div>
                </div>

                {/* Center: Overlay Info */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none w-full">
                    <AnimatePresence mode="wait">
                        {isCountdown && state.countdown && (
                            <motion.div
                                key="countdown"
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1.5, opacity: 1 }}
                                exit={{ scale: 2, opacity: 0 }}
                                className="text-8xl font-black text-white italic drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                            >
                                {Math.ceil(Math.max((state.countdown.endsAt - Date.now()) / 1000, 0))}
                            </motion.div>
                        )}

                        {isRunning && lastRoundMoves && (
                            <motion.div
                                key="reveal"
                                initial={{ scale: 0, opacity: 0, rotate: -20 }}
                                animate={{ scale: 1.2, opacity: 1, rotate: 0 }}
                                exit={{ scale: 1.5, opacity: 0 }}
                                className="flex flex-col items-center"
                            >
                                <motion.span
                                    initial={{ y: -50, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-4xl font-bold text-white/50 uppercase tracking-[0.5em] mb-4 italic"
                                >
                                    {myAnimState === 'win' || oppAnimState === 'win' || (myAnimState === 'idle' && oppAnimState === 'idle') ? "RESULT" : "CLASH!"}
                                </motion.span>
                                <span className="text-7xl font-black text-amber-400 uppercase tracking-tighter drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] px-4 text-center">
                                    {myAnimState === 'win' || oppAnimState === 'win' ? (lastRoundWinner === selfUserId ? "VICTORY!" : "DEFEAT") : (myAnimState === 'idle' && oppAnimState === 'idle' ? "DRAW" : "SHOWDOWN!")}
                                </span>
                            </motion.div>
                        )}

                        {isRunning && !lastRoundMoves && !state.submittedMove && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center"
                            >
                                <Sword className="w-12 h-12 text-rose-500 mb-2 animate-pulse" />
                                <span className="text-2xl font-black text-rose-500 uppercase tracking-widest">Duel!</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right: Opponent */}
                <div className="flex flex-col items-center justify-end">
                    {opponentUserId ? (
                        <div className="relative">
                            <AnimeCharacter state={oppAnimState} isOpponent className="w-64 h-64 md:w-80 md:h-80" />
                            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center w-full">
                                <span className="block text-white font-black text-xl tracking-widest uppercase drop-shadow-lg">Rival</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-64 h-64 flex items-center justify-center text-white/20">
                            Waiting...
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Controls (Action Bar) */}
            <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/90 to-transparent p-4 z-20">
                {isRunning && !state.submittedMove && !lastRoundMoves ? (
                    <div className="flex justify-center gap-4 items-center h-full">
                        {(['rock', 'paper', 'scissors'] as const).map((move) => (
                            <button
                                key={move}
                                onClick={() => submitMove(move)}
                                className="group relative flex flex-col items-center justify-center w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 border-2 border-white/20 hover:border-white transition-all hover:scale-110 active:scale-95"
                            >
                                <span className="text-2xl mb-1 group-hover:animate-bounce">
                                    {move === 'rock' ? '✊' : move === 'paper' ? '✋' : '✌️'}
                                </span>
                                <span className="text-[10px] font-bold text-white uppercase tracking-wider">{move}</span>
                            </button>
                        ))}
                    </div>
                ) : (state.phase === 'ended') ? (
                    <div className="flex justify-center items-center h-full">
                        <button
                            onClick={onRestart}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                        >
                            Play Again
                        </button>
                    </div>
                ) : (
                    <div className="flex justify-center items-center h-full text-white/50 text-sm font-medium uppercase tracking-widest">
                        {state.submittedMove ? "Move Locked" : "Waiting for round..."}
                    </div>
                )}
            </div>
        </div>
    );
};
