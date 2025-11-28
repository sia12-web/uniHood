import React from 'react';
import type { PlayerRole } from '../types';
import clsx from 'clsx';

interface TurnIndicatorProps {
    turn: PlayerRole;
    myRole: PlayerRole | null;
    status: string;
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({ turn, myRole, status }) => {
    if (status === 'finished') return null;



    return (
        <div className="flex items-center justify-center gap-4 mb-6">
            <div className={clsx(
                "px-6 py-2 rounded-full font-bold text-lg transition-all duration-300 border-2",
                turn === 'X'
                    ? "bg-cyan-950/50 border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                    : "border-transparent text-slate-500 opacity-50 scale-90"
            )}>
                Player X
            </div>

            <div className="text-slate-400 font-mono text-sm">VS</div>

            <div className={clsx(
                "px-6 py-2 rounded-full font-bold text-lg transition-all duration-300 border-2",
                turn === 'O'
                    ? "bg-fuchsia-950/50 border-fuchsia-400 text-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.3)]"
                    : "border-transparent text-slate-500 opacity-50 scale-90"
            )}>
                Player O
            </div>

            {myRole && myRole !== 'Spectator' && (
                <div className="absolute top-4 right-4 text-xs font-mono text-slate-500">
                    You are: <span className={myRole === 'X' ? "text-cyan-400" : "text-fuchsia-400"}>{myRole}</span>
                </div>
            )}
        </div>
    );
};
