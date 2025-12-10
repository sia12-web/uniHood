import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { TicTacToeState } from '../hooks/useTicTacToeSession';
import { CheckCircle2, RotateCcw, LogOut, AlertTriangle, Timer, XCircle, Trophy, Loader2 } from 'lucide-react';
import { MyPointsBadge } from './MyPointsBadge';

interface BoardProps {
    state: TicTacToeState;
    onMove: (index: number) => void;
    onRestart: () => void;
    onToggleReady: () => void;
    onLeave?: () => void;
    playerNames?: Record<string, string>;
}

export const TicTacToeBoard: React.FC<BoardProps> = ({ state, onMove, onRestart, onToggleReady, onLeave, playerNames }) => {
    const { board, turn, myRole, connected, status, players, ready, roundWins, countdown, error, lastRoundWinner, roundIndex, matchWinner, leaveReason, winner } = state;
    const isMyTurn = myRole === turn && status === 'playing';
    const canPlay = connected && status === 'playing' && isMyTurn;
    const showBoard = status === 'playing' || status === 'countdown';
    const opponentLeft = leaveReason === 'opponent_left';

    const roundNumber = typeof roundIndex === 'number' ? roundIndex + 1 : 1;
    const lastWinnerId = lastRoundWinner || null;
    const isRoundDraw = winner === 'draw';

    const resolveName = (userId?: string) => {
        if (!userId) return "Opponent";
        if (playerNames && playerNames[userId]) return playerNames[userId];
        return userId.slice(0, 6);
    };

    const getPlayerName = (role: 'X' | 'O') => {
        const userId = players[role];
        if (!userId) return `Player ${role}`;
        return resolveName(userId);
    };

    // myRole is 'X', 'O', or 'spectator' from the hook
    const myPlayerRole = myRole === 'X' || myRole === 'O' ? myRole : null;
    const isSpectator = !myPlayerRole;
    
    // Get my userId for ready state lookup
    const myUserId = myPlayerRole ? players[myPlayerRole] : undefined;

    // --- Render Helpers ---

    const renderLobby = () => {
        const xId = players.X;
        const oId = players.O;
        const xReady = xId && ready[xId];
        const oReady = oId && ready[oId];

        const participants = [
            { role: 'X', id: xId, ready: xReady, name: getPlayerName('X') },
            { role: 'O', id: oId, ready: oReady, name: getPlayerName('O') }
        ];

        return (
            <div className="space-y-8 max-w-2xl mx-auto">
                <div className="flex justify-center mb-4">
                    <MyPointsBadge />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {participants.map((p) => (
                        <div
                            key={p.role}
                            className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${p.ready
                                ? "border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-500/20"
                                : "border-slate-200 bg-white"
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${p.role === 'X' ? "bg-cyan-100 text-cyan-700" : "bg-pink-100 text-pink-700"
                                        }`}>
                                        {p.role}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900">
                                            {p.id ? p.name : "Waiting..."}
                                            {p.id === myUserId && <span className="text-xs font-normal text-slate-500 ml-1">(You)</span>}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {p.id ? (p.ready ? "Ready to play" : "Not ready") : "Waiting for player"}
                                        </div>
                                    </div>
                                </div>
                                {p.ready ? (
                                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Ready
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                                        <Timer className="h-3.5 w-3.5" />
                                        Waiting
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col items-center justify-center gap-4 border-t border-slate-100 pt-8">
                    {!isSpectator && (
                        <button
                            onClick={onToggleReady}
                            className={`group relative flex items-center gap-2 overflow-hidden rounded-xl px-8 py-3 font-bold transition-all ${ready[myUserId || '']
                                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                : "bg-slate-900 text-white shadow-lg hover:bg-slate-800"
                                }`}
                        >
                            {ready[myUserId || ''] ? (
                                <>
                                    <XCircle className="h-5 w-5" />
                                    Cancel Ready
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-5 w-5" />
                                    I&apos;m Ready
                                </>
                            )}
                        </button>
                    )}

                    <div className="text-xs font-medium text-slate-400">
                        {xReady && oReady ? "Starting game..." : "Waiting for both players to ready up"}
                    </div>

                    {onLeave && (
                        <button
                            onClick={onLeave}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-500 transition-colors mt-2"
                        >
                            <LogOut className="h-4 w-4" />
                            Leave Game
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // Render round result announcement (similar to RPS)
    const renderRoundResult = () => {
        const iWonRound = lastWinnerId === myUserId;
        const opponentWonRound = lastWinnerId && lastWinnerId !== myUserId;
        
        // Get scores
        const myRoundWins = myUserId ? (roundWins[myUserId] || 0) : 0;
        const opponentUserId = myPlayerRole === 'X' ? players.O : players.X;
        const opponentRoundWins = opponentUserId ? (roundWins[opponentUserId] || 0) : 0;
        const opponentName = opponentUserId ? resolveName(opponentUserId) : "Opponent";
        
        // The completed round number (roundIndex is 0-based and has already been incremented)
        const completedRound = roundNumber > 1 ? roundNumber - 1 : 1;
        
        return (
            <div className="py-8 animate-in fade-in duration-300 max-w-md mx-auto">
                <div className="mb-6 text-center">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Round {completedRound} Result</span>
                    {isRoundDraw ? (
                        <>
                            <div className="mx-auto mt-4 mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                <span className="text-3xl font-bold">=</span>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-600">
                                It&apos;s a Draw!
                            </h3>
                        </>
                    ) : iWonRound ? (
                        <>
                            <div className="mx-auto mt-4 mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                <Trophy className="h-10 w-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-emerald-600">
                                You Won This Round! 🎉
                            </h3>
                        </>
                    ) : (
                        <>
                            <div className="mx-auto mt-4 mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                                <XCircle className="h-10 w-10" />
                            </div>
                            <h3 className="text-2xl font-bold text-rose-600">
                                {opponentName} Won This Round
                            </h3>
                        </>
                    )}
                </div>

                {/* Score display */}
                <div className="flex items-center justify-center gap-4 text-sm">
                    <div className={`px-4 py-2 rounded-full ${myRoundWins > opponentRoundWins ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        <span className="font-bold">You: {myRoundWins}</span>
                    </div>
                    <span className="text-slate-300">—</span>
                    <div className={`px-4 py-2 rounded-full ${opponentRoundWins > myRoundWins ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        <span className="font-bold">{opponentName}: {opponentRoundWins}</span>
                    </div>
                </div>

                <p className="mt-6 text-sm text-slate-500 animate-pulse text-center">Next round starting soon...</p>
            </div>
        );
    };

    // Only show countdown screen for round 1 (initial game start), not during round transitions
    const renderCountdown = () => {
        // For rounds after the first, show the board instead of countdown
        if (roundNumber > 1) {
            return renderBoard();
        }
        return (
            <div className="relative flex flex-col items-center justify-center py-12">
                <div className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full bg-white shadow-2xl ring-4 ring-cyan-50">
                    <span className="text-8xl font-black tracking-tighter text-cyan-600">
                        {countdown}
                    </span>
                </div>
                <div className="mt-8 text-center">
                    <h3 className="text-2xl font-bold text-slate-900">Get Ready!</h3>
                    <p className="text-slate-500">Game is starting</p>
                </div>
            </div>
        );
    };

    const renderResults = () => (
        <div className="text-center max-w-md mx-auto">
            {opponentLeft && (
                <div className="mb-6 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-left">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">Opponent left</p>
                        <p className="text-sm text-amber-600">You win by forfeit!</p>
                    </div>
                </div>
            )}

            <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-8 ring-amber-50">
                <Trophy className="h-10 w-10" />
            </div>

            <h2 className="text-3xl font-bold text-slate-900 mb-2">
                {matchWinner ? (
                    matchWinner === myRole ? "Victory!" : `${resolveName(matchWinner)} Won!`
                ) : (
                    "Game Over"
                )}
            </h2>
            <p className="text-slate-600 mb-2">
                {matchWinner === myRole ? "You won the game!" : matchWinner ? "Better luck next time." : "The match ended in a tie."}
            </p>
            <p className="text-slate-500 mb-8">
                Final Score: {players.X ? roundWins[players.X] || 0 : 0} - {players.O ? roundWins[players.O] || 0 : 0}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className={`p-4 rounded-xl border ${matchWinner === players.X ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
                    <div className="text-xs font-bold uppercase text-slate-400 mb-1">Player X</div>
                    <div className="font-bold text-slate-900 text-lg mb-1">{getPlayerName('X')}</div>
                    <div className="text-2xl font-black text-slate-900">{roundWins[players.X || ''] || 0} Wins</div>
                </div>
                <div className={`p-4 rounded-xl border ${matchWinner === players.O ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
                    <div className="text-xs font-bold uppercase text-slate-400 mb-1">Player O</div>
                    <div className="font-bold text-slate-900 text-lg mb-1">{getPlayerName('O')}</div>
                    <div className="text-2xl font-black text-slate-900">{roundWins[players.O || ''] || 0} Wins</div>
                </div>
            </div>

            <button
                onClick={onRestart}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
            >
                <RotateCcw className="w-4 h-4" />
                Play Again
            </button>
        </div>
    );

    const renderBoard = () => (
        <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto">
            {/* Scoreboard Header */}
            <div className="flex items-center justify-between w-full px-6 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className={clsx("flex items-center gap-4 px-4 py-2 rounded-xl transition-colors", turn === 'X' ? "bg-cyan-50 border border-cyan-100" : "bg-transparent border border-transparent")}>
                    <div className="flex flex-col items-center justify-center h-10 w-10 rounded-full bg-cyan-100 text-cyan-700 font-bold text-lg">X</div>
                    <div>
                        <div className="text-xs font-bold uppercase text-slate-400">Player X</div>
                        <div className="font-bold text-slate-900">{getPlayerName('X')}</div>
                        <div className="text-xs font-medium text-cyan-600">{roundWins[players.X || ''] || 0} Wins</div>
                    </div>
                </div>

                <div className="flex flex-col items-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Best of 5 • Round {roundNumber}</div>
                    <div className="text-xl font-black text-slate-300">VS</div>
                </div>

                <div className={clsx("flex items-center gap-4 px-4 py-2 rounded-xl transition-colors", turn === 'O' ? "bg-pink-50 border border-pink-100" : "bg-transparent border border-transparent")}>
                    <div className="text-right">
                        <div className="text-xs font-bold uppercase text-slate-400">Player O</div>
                        <div className="font-bold text-slate-900">{getPlayerName('O')}</div>
                        <div className="text-xs font-medium text-pink-600">{roundWins[players.O || ''] || 0} Wins</div>
                    </div>
                    <div className="flex flex-col items-center justify-center h-10 w-10 rounded-full bg-pink-100 text-pink-700 font-bold text-lg">O</div>
                </div>
            </div>

            {/* Board Grid */}
            <div className="relative">
                <div className={clsx(
                    "grid grid-cols-3 gap-3 p-4 bg-slate-100 rounded-3xl border border-slate-200 shadow-inner",
                    (!isMyTurn || status === 'countdown') && "opacity-90 grayscale-[0.2]"
                )}>
                    {board.map((cell, index) => (
                        <motion.button
                            key={index}
                            whileHover={!cell && canPlay ? { scale: 0.98 } : {}}
                            whileTap={!cell && canPlay ? { scale: 0.95 } : {}}
                            onClick={() => canPlay && !cell && onMove(index)}
                            disabled={!!cell || !canPlay || status === 'countdown'}
                            className={clsx(
                                "w-24 h-24 sm:w-32 sm:h-32 rounded-2xl flex items-center justify-center text-6xl relative overflow-hidden transition-all shadow-sm",
                                "bg-white border-2",
                                !cell && canPlay
                                    ? "cursor-pointer border-slate-200 hover:border-cyan-200 hover:shadow-md"
                                    : "border-slate-100 cursor-default",
                                cell === 'X' && "border-cyan-100 bg-cyan-50/30",
                                cell === 'O' && "border-pink-100 bg-pink-50/30"
                            )}
                        >
                            {cell === 'X' && (
                                <motion.span
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-cyan-500 font-black drop-shadow-sm"
                                >
                                    X
                                </motion.span>
                            )}
                            {cell === 'O' && (
                                <motion.span
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-pink-500 font-black drop-shadow-sm"
                                >
                                    O
                                </motion.span>
                            )}
                        </motion.button>
                    ))}
                </div>

                {/* Turn Indicator Overlay */}
                {status === 'countdown' && (
                    <div className="mt-6 text-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700 shadow-sm ring-1 ring-amber-200">
                            <Timer className="h-4 w-4" />
                            Starting in {countdown}...
                        </div>
                    </div>
                )}
                {!isMyTurn && status === 'playing' && (
                    <div className="mt-6 text-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500 animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opponent&apos;s turn...
                        </div>
                    </div>
                )}
                {isMyTurn && status === 'playing' && (
                    <div className="mt-6 text-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-cyan-100 px-4 py-2 text-sm font-bold text-cyan-700 shadow-sm ring-1 ring-cyan-200">
                            Your turn!
                        </div>
                    </div>
                )}
            </div>

            {onLeave && (
                <button
                    onClick={onLeave}
                    className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-rose-500 transition-colors"
                >
                    <LogOut className="h-3 w-3" />
                    Forfeit & Leave
                </button>
            )}
        </div>
    );

    // Check if we should show round result (lobby status with lastRoundWinner or draw, and not the initial lobby)
    const hasRoundResult = status === 'lobby' && (lastWinnerId || isRoundDraw) && (roundIndex !== undefined && roundIndex > 0);

    return (
        <div className="w-full">
            {!connected && !error ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Loader2 className="h-8 w-8 animate-spin mb-4 text-slate-300" />
                    <p>Connecting to game server...</p>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-rose-600 text-center">
                    <AlertTriangle className="mb-4 h-12 w-12 opacity-20" />
                    <p className="font-medium text-lg">Connection Error</p>
                    <p className="text-sm opacity-80 max-w-xs mx-auto mb-6">{error === 'unresolved_socket' ? 'Server configuration error' : 'Could not connect to game lobby'}</p>
                    <button onClick={() => window.location.reload()} className="text-sm underline hover:text-rose-800">Reload Page</button>
                </div>
            ) : status === 'countdown' ? (
                renderCountdown()
            ) : status === 'finished' ? (
                renderResults()
            ) : status === 'playing' ? (
                renderBoard()
            ) : hasRoundResult ? (
                renderRoundResult()
            ) : (
                renderLobby()
            )}
        </div>
    );
};
