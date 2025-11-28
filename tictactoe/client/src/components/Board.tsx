import React from 'react';
import { motion } from 'framer-motion';
import type { BoardState, PlayerRole } from '../types';
import clsx from 'clsx';

interface BoardProps {
    board: BoardState;
    onMove: (index: number) => void;
    myRole: PlayerRole | null;
    isMyTurn: boolean;
    winningLine: number[] | null;
}

const XIcon = () => (
    <svg viewBox="0 0 100 100" className="w-full h-full p-4 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
        <motion.path
            d="M 20 20 L 80 80 M 80 20 L 20 80"
            fill="transparent"
            stroke="#22d3ee" // Cyan-400
            strokeWidth="12"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
        />
    </svg>
);

const OIcon = () => (
    <svg viewBox="0 0 100 100" className="w-full h-full p-4 drop-shadow-[0_0_10px_rgba(232,121,249,0.8)]">
        <motion.circle
            cx="50"
            cy="50"
            r="35"
            fill="transparent"
            stroke="#e879f9" // Fuchsia-400
            strokeWidth="12"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
        />
    </svg>
);

export const Board: React.FC<BoardProps> = ({ board, onMove, myRole, isMyTurn, winningLine }) => {
    const canInteract = myRole && myRole !== 'Spectator' && isMyTurn;

    return (
        <div className="relative w-full max-w-md aspect-square bg-slate-900/50 rounded-xl p-4 backdrop-blur-sm border border-slate-700 shadow-2xl">
            {/* Grid Lines */}
            <div className="absolute inset-4 grid grid-cols-3 grid-rows-3 gap-2 pointer-events-none">
                {/* We use gap for spacing, but let's draw lines explicitly for style if needed. 
            Actually, gap + background color of container works, but let's make it look like a grid.
        */}
            </div>

            <div className="grid grid-cols-3 grid-rows-3 gap-3 h-full">
                {board.map((cell, index) => {
                    const isWinningCell = winningLine?.includes(index);

                    return (
                        <motion.button
                            key={index}
                            whileHover={canInteract && !cell ? { scale: 1.05, backgroundColor: "rgba(255,255,255,0.05)" } : {}}
                            whileTap={canInteract && !cell ? { scale: 0.95 } : {}}
                            onClick={() => canInteract && !cell && onMove(index)}
                            disabled={!canInteract || !!cell}
                            className={clsx(
                                "relative flex items-center justify-center rounded-lg transition-colors duration-200",
                                "bg-slate-800/80 border border-slate-700/50",
                                isWinningCell && "bg-green-900/30 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]",
                                !cell && canInteract && "cursor-pointer hover:border-slate-500",
                                (!canInteract || cell) && "cursor-default"
                            )}
                        >
                            {cell === 'X' && <XIcon />}
                            {cell === 'O' && <OIcon />}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
};
