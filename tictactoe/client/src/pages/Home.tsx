import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export const Home: React.FC = () => {
    const [joinCode, setJoinCode] = useState('');
    const navigate = useNavigate();

    const handleCreate = async () => {
        try {
            const res = await fetch('http://localhost:3000/sessions', { method: 'POST' });
            const data = await res.json();
            localStorage.setItem('playerId', data.playerId);
            localStorage.setItem('role', data.role);
            navigate(`/game/${data.code}`);
        } catch (err) {
            console.error(err);
            alert('Failed to create session');
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinCode) return;

        try {
            const res = await fetch('http://localhost:3000/sessions/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: joinCode })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to join');
                return;
            }

            const data = await res.json();
            localStorage.setItem('playerId', data.playerId);
            localStorage.setItem('role', data.role);
            navigate(`/game/${data.initialState.code}`);
        } catch (err) {
            console.error(err);
            alert('Failed to join session');
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white font-sans overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-10 max-w-md w-full space-y-8 text-center"
            >
                <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-br from-cyan-400 to-fuchsia-500 bg-clip-text text-transparent drop-shadow-lg">
                    TIC TAC TOE
                </h1>

                <div className="space-y-4">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCreate}
                        className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xl border border-slate-700 shadow-xl transition-colors"
                    >
                        Create New Game
                    </motion.button>

                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-slate-800"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-600">OR</span>
                        <div className="flex-grow border-t border-slate-800"></div>
                    </div>

                    <form onSubmit={handleJoin} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Enter Code"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-center font-mono text-lg focus:outline-none focus:border-cyan-500 transition-colors uppercase placeholder:text-slate-600"
                            maxLength={6}
                        />
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            className="px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 rounded-xl font-bold shadow-lg hover:shadow-fuchsia-500/30 transition-shadow"
                        >
                            Join
                        </motion.button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
};
