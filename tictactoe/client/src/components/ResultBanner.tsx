import React from 'react';
import { motion } from 'framer-motion';
import type { PlayerRole } from '../types';

interface ResultBannerProps {
    winner: PlayerRole | 'draw' | null;
    onRematch: () => void;
}

export const ResultBanner: React.FC<ResultBannerProps> = ({ winner, onRematch }) => {
    if (!winner) return null;

    const isDraw = winner === 'draw';
    const text = isDraw ? "It's a Draw!" : `Player ${winner} Wins!`;
    const colorClass = isDraw ? "text-slate-200" : winner === 'X' ? "text-cyan-400" : "text-fuchsia-400";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 rounded-xl"
        >
            <motion.h2
                className={`text-5xl font-black ${colorClass} drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-8 text-center`}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
            >
                {text}
            </motion.h2>

            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onRematch}
                className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg font-bold text-white shadow-lg hover:shadow-indigo-500/50 transition-shadow"
            >
                Play Again
            </motion.button>
        </motion.div>
    );
};
