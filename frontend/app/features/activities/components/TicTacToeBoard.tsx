import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { TicTacToeState } from '../hooks/useTicTacToeSession';

interface BoardProps {
    state: TicTacToeState;
    onMove: (index: number) => void;
    onRestart: () => void;
}

export const TicTacToeBoard: React.FC<BoardProps> = ({ state, onMove, onRestart }) => {
    const { board, turn, winner, myRole, connected } = state;
    const isMyTurn = myRole === turn;
    const canPlay = connected && !winner && isMyTurn;

    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8">
            <div className="text-2xl font-bold text-white flex items-center gap-4">
                <div className={clsx("px-4 py-2 rounded-lg transition-colors", turn === 'X' ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50" : "text-slate-500")}>
                    Player X
                </div>
                <div className="text-slate-600">vs</div>
                <div className={clsx("px-4 py-2 rounded-lg transition-colors", turn === 'O' ? "bg-pink-500/20 text-pink-400 border border-pink-500/50" : "text-slate-500")}>
                    Player O
                </div>
            </div>

            <div className="relative bg-slate-800/50 p-4 rounded-xl backdrop-blur-sm border border-slate-700/50 shadow-2xl">
                <div className="grid grid-cols-3 gap-2">
                    {board.map((cell, index) => (
                        <motion.button
                            key={index}
                            whileHover={!cell && canPlay ? { scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" } : {}}
                            whileTap={!cell && canPlay ? { scale: 0.95 } : {}}
                            onClick={() => canPlay && !cell && onMove(index)}
                            disabled={!!cell || !canPlay}
                            className={clsx(
                                "w-24 h-24 rounded-lg flex items-center justify-center text-4xl relative overflow-hidden transition-colors",
                                "bg-slate-900/80 border border-slate-700/50",
                                !cell && canPlay && "cursor-pointer hover:border-slate-500",
                                !cell && !canPlay && "cursor-default opacity-80"
                            )}
                        >
                            {cell === 'X' && (
                                <motion.svg initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3 }} viewBox="0 0 100 100" className="w-16 h-16 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                                    <path d="M20 20 L80 80 M80 20 L20 80" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                                </motion.svg>
                            )}
                            {cell === 'O' && (
                                <motion.svg initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3 }} viewBox="0 0 100 100" className="w-16 h-16 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]">
                                    <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                                </motion.svg>
                            )}
                        </motion.button>
                    ))}
                </div>

                {/* Winning Line Overlay could go here if we had winning line indices */}
            </div>

            {winner && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-4 bg-slate-900/90 p-6 rounded-xl border border-slate-700 shadow-xl absolute inset-0 m-auto h-fit w-fit z-10"
                >
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
                        {winner === 'draw' ? "It's a Draw!" : `Player ${winner} Wins!`}
                    </h2>
                    <button
                        onClick={onRestart}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-full hover:shadow-lg hover:scale-105 transition-all"
                    >
                        Play Again
                    </button>
                </motion.div>
            )}

            {!connected && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 backdrop-blur-sm">
                    <div className="text-white text-xl font-mono animate-pulse">Connecting...</div>
                </div>
            )}
        </div>
    );
};
