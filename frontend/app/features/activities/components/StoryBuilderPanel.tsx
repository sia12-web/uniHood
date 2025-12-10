"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, User, Send, BookOpen, PenTool, Star, Trophy, Check, Heart, LogOut, AlertTriangle } from "lucide-react";
import { useStoryBuilderSession } from "@/app/features/activities/hooks/useStoryBuilderSession";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId } from "@/lib/env";
import { motion } from "framer-motion";
import clsx from "clsx";
import { MyPointsBadge } from "./MyPointsBadge";

export function StoryBuilderPanel({ sessionId }: { sessionId: string }) {
    const { state, toggleReady, submitParagraph, voteParagraph, leave, selfId } = useStoryBuilderSession(sessionId);
    const [inputText, setInputText] = useState("");
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [showGenderModal, setShowGenderModal] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const {
        status,
        participants,
        paragraphs,
        currentTurnUserId,
        winnerUserId,
        connected,
        error,
        leaveReason
    } = state;

    const handleReadyClick = () => {
        const me = participants.find(p => p.userId === selfId);
        if (me?.ready) {
            toggleReady(); // Un-ready
        } else {
            setShowGenderModal(true);
        }
    };

    const handleGenderSelect = (gender: 'boy' | 'girl') => {
        toggleReady(gender);
        setShowGenderModal(false);
    };

    // Fetch friends to resolve names
    useEffect(() => {
        const loadNames = async () => {
            try {
                const user = readAuthUser();
                const userId = user?.userId || getDemoUserId();
                const friends = await fetchFriends(userId, user?.campusId || null, "accepted");

                const names: Record<string, string> = {};
                friends.forEach(f => {
                    names[f.friend_id] = f.friend_display_name || f.friend_handle || `User ${f.friend_id.slice(0, 4)}`;
                });

                // Also set self name if available
                if (user?.displayName) {
                    names[userId] = user.displayName;
                }

                setUserNames(names);
            } catch (e) {
                console.error("Failed to load friend names", e);
            }
        };
        loadNames();
    }, []);

    const getDisplayName = (userId: string) => {
        if (userId === selfId) return "You";
        return userNames[userId] || `User ${userId.slice(0, 4)}`;
    };

    // Auto-scroll to bottom when paragraphs change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [paragraphs]);

    if (!connected) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                    <p className="text-sm font-medium">Connecting to story...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="rounded-lg bg-rose-50 p-4 text-center text-rose-600">
                    <p className="font-semibold">Something went wrong</p>
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const me = participants.find(p => p.userId === selfId);
    const isMyTurn = currentTurnUserId === selfId;

    // Lobby Phase
    if (status === 'pending' || status === 'countdown') {
        const storyPrompt = state.storyPrompt;
        
        return (
            <div className="flex flex-col items-center justify-center gap-8 py-12 text-center max-w-2xl mx-auto">
                <MyPointsBadge />

                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-violet-50 text-violet-600 shadow-inner">
                    <BookOpen className="h-12 w-12" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-3xl font-bold text-slate-900">Story Builder</h2>
                    <p className="text-slate-600">Collaboratively write a story, then vote on the best parts!</p>
                </div>

                {/* Show the story prompt preview */}
                {storyPrompt && (
                    <div className="w-full p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-rose-50 border border-violet-100 text-left">
                        <div className="flex items-center gap-2 mb-3">
                            <Heart className="h-4 w-4 text-rose-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-violet-600">Today&apos;s Theme</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{storyPrompt.title}</h3>
                        <p className="text-sm font-serif text-slate-600 italic leading-relaxed">
                            &ldquo;{storyPrompt.opening}&rdquo;
                        </p>
                    </div>
                )}

                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {participants.map(p => (
                        <div key={p.userId} className={clsx(
                            "flex items-center justify-between p-4 rounded-xl border transition-all",
                            p.ready ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                                    <User className="h-5 w-5 text-slate-500" />
                                </div>
                                <span className="font-medium text-slate-900">
                                    {getDisplayName(p.userId)}
                                </span>
                            </div>
                            {p.ready && <Check className="h-5 w-5 text-emerald-600" />}
                        </div>
                    ))}
                </div>

                {status === 'countdown' ? (
                    <div className="text-2xl font-bold text-violet-600 animate-pulse">
                        Starting soon...
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 items-center">
                        <button
                            onClick={handleReadyClick}
                            className={clsx(
                                "rounded-2xl px-8 py-4 text-lg font-bold text-white shadow-lg transition-all transform hover:scale-105 active:scale-95",
                                me?.ready ? "bg-slate-400 hover:bg-slate-500" : "bg-violet-600 hover:bg-violet-500"
                            )}
                        >
                            {me?.ready ? "Waiting for others..." : "I'm Ready!"}
                        </button>
                        <button
                            onClick={leave}
                            className="flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600 transition-colors"
                        >
                            <LogOut className="h-4 w-4" />
                            Leave Story
                        </button>
                    </div>
                )}

                {/* Gender Selection Modal */}
                {showGenderModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                            <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">Choose Your Character</h3>
                            <p className="text-slate-600 text-center mb-8">This helps us pick the perfect story theme for you!</p>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <button
                                    onClick={() => handleGenderSelect('boy')}
                                    className="flex flex-col items-center gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                                >
                                    <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                                        <User className="h-8 w-8" />
                                    </div>
                                    <span className="font-bold text-slate-900 group-hover:text-blue-700">Boy</span>
                                </button>
                                
                                <button
                                    onClick={() => handleGenderSelect('girl')}
                                    className="flex flex-col items-center gap-4 p-6 rounded-2xl border-2 border-slate-100 hover:border-pink-500 hover:bg-pink-50 transition-all group"
                                >
                                    <div className="h-16 w-16 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 group-hover:scale-110 transition-transform">
                                        <User className="h-8 w-8" />
                                    </div>
                                    <span className="font-bold text-slate-900 group-hover:text-pink-700">Girl</span>
                                </button>
                            </div>
                            
                            <button
                                onClick={() => setShowGenderModal(false)}
                                className="w-full py-3 text-slate-500 font-medium hover:text-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Writing Phase
    if (status === 'writing') {
        const storyPrompt = state.storyPrompt;
        
        return (
            <div className="flex flex-col h-[80vh] max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
                            <PenTool className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">{storyPrompt?.title || "Writing Phase"}</h3>
                            {storyPrompt?.opening && (
                                <p className="text-xs text-slate-500 italic mb-1 max-w-md">
                                    &ldquo;{storyPrompt.opening}&rdquo;
                                </p>
                            )}
                            <p className="text-xs font-medium text-violet-600">
                                {isMyTurn ? "It's your turn to write!" : `Waiting for ${getDisplayName(currentTurnUserId || "")}...`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-slate-500">
                            Turn {state.turnIndex + 1} of {state.maxParagraphsPerUser * participants.length}
                        </div>
                        <button
                            onClick={leave}
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-600 transition-colors px-2 py-1 rounded hover:bg-rose-50"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Leave
                        </button>
                    </div>
                </div>

                {/* Story Content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
                    {/* Story Opening Prompt */}
                    {storyPrompt && (
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-50 to-rose-50 border border-violet-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen className="h-4 w-4 text-violet-500" />
                                <span className="text-xs font-bold uppercase tracking-wider text-violet-600">Story Prompt</span>
                            </div>
                            <p className="text-lg font-serif text-slate-800 leading-relaxed italic">
                                &ldquo;{storyPrompt.opening}&rdquo;
                            </p>
                            <p className="mt-3 text-xs text-slate-500">Continue the story from here...</p>
                        </div>
                    )}
                    
                    {paragraphs.length === 0 && !storyPrompt && (
                        <div className="text-center text-slate-400 italic py-10">
                            The page is blank. Start the story...
                        </div>
                    )}
                    {paragraphs.map((p, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={clsx(
                                "p-6 rounded-2xl border shadow-sm",
                                p.userId === selfId ? "bg-violet-50 border-violet-100 ml-12" : "bg-white border-slate-100 mr-12"
                            )}
                        >
                            <p className="text-slate-800 leading-relaxed text-lg font-serif">{p.text}</p>
                            <div className="mt-3 flex justify-end">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                    {getDisplayName(p.userId)}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Input Area */}
                <div className="p-6 bg-white border-t border-slate-100">
                    {isMyTurn ? (
                        <div className="flex gap-4">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Write the next part of the story..."
                                className="flex-1 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none h-32 font-serif text-lg"
                                autoFocus
                            />
                            <button
                                onClick={() => {
                                    if (inputText.trim()) {
                                        submitParagraph(inputText);
                                        setInputText("");
                                    }
                                }}
                                disabled={!inputText.trim()}
                                className="px-6 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex flex-col items-center justify-center gap-2"
                            >
                                <Send className="h-5 w-5" />
                                <span>Send</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-20 text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            Waiting for the next chapter...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Voting Phase
    if (status === 'voting') {
        return (
            <div className="max-w-3xl mx-auto py-8 space-y-8">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold text-slate-900">Time to Vote!</h2>
                    <p className="text-slate-600">Rate each paragraph from 0 to 10.</p>
                </div>

                <div className="space-y-6">
                    {paragraphs.map((p, idx) => {
                        const isMine = p.userId === selfId;
                        const myVote = p.votes[selfId];

                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
                            >
                                <p className="text-lg font-serif text-slate-800 mb-4">{p.text}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase">
                                        {isMine ? "Your Paragraph" : `By ${getDisplayName(p.userId)}`}
                                    </span>

                                    {isMine ? (
                                        <div className="text-sm text-slate-400 italic">
                                            You cannot vote on your own paragraph
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-medium text-slate-600">Score: {myVote ?? "-"}</span>
                                            <div className="flex gap-1">
                                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                                                    <button
                                                        key={score}
                                                        onClick={() => voteParagraph(idx, score)}
                                                        className={clsx(
                                                            "w-8 h-8 rounded-full text-xs font-bold transition-all",
                                                            myVote === score
                                                                ? "bg-violet-600 text-white scale-110 shadow-md"
                                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                        )}
                                                    >
                                                        {score}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="text-center text-slate-500 text-sm">
                    Waiting for everyone to finish voting...
                </div>
            </div>
        );
    }

    // Ended Phase
    if (status === 'ended') {
        const winner = participants.find(p => p.userId === winnerUserId);
        const isWinner = winnerUserId === selfId;
        const storyPrompt = state.storyPrompt;
        const opponentLeft = leaveReason === 'opponent_left';

        return (
            <div className="max-w-3xl mx-auto py-12 space-y-10">
                {/* Opponent Left Banner */}
                {opponentLeft && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800"
                    >
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold">Your partner left the story</p>
                            <p className="text-sm text-amber-600">You win by forfeit!</p>
                        </div>
                    </motion.div>
                )}

                <div className="text-center space-y-4">
                    <div className="inline-flex p-4 rounded-full bg-yellow-100 text-yellow-600 mb-4">
                        <Trophy className="h-12 w-12" />
                    </div>
                    <h2 className="text-4xl font-bold text-slate-900">
                        {opponentLeft ? "You Win!" : (isWinner ? "You Won!" : "Story Complete!")}
                    </h2>
                    {!opponentLeft && (
                        <p className="text-xl text-slate-600">
                            Winner: <span className="font-bold text-violet-600">{getDisplayName(winnerUserId || "")}</span> with {winner?.score} points!
                        </p>
                    )}
                </div>

                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
                    <div className="p-8 bg-gradient-to-br from-violet-50 to-rose-50 border-b border-slate-200">
                        <h3 className="text-2xl font-serif font-bold text-slate-800 text-center">
                            {storyPrompt?.title || "The Final Story"}
                        </h3>
                    </div>
                    <div className="p-10 space-y-6">
                        {/* Opening prompt as the story beginning */}
                        {storyPrompt && (
                            <div className="relative pl-6 border-l-4 border-rose-200">
                                <p className="text-lg font-serif text-slate-600 leading-relaxed italic">
                                    {storyPrompt.opening}
                                </p>
                                <div className="mt-2">
                                    <span className="text-xs font-bold text-rose-400 uppercase">Opening</span>
                                </div>
                            </div>
                        )}
                        {paragraphs.map((p, idx) => (
                            <div key={idx} className="relative pl-6 border-l-4 border-violet-200">
                                <p className="text-lg font-serif text-slate-800 leading-relaxed">{p.text}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase">
                                        {getDisplayName(p.userId)}
                                    </span>
                                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        <Star className="h-3 w-3 fill-current" />
                                        {Object.values(p.votes).reduce((a, b) => a + b, 0)} pts
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {participants.sort((a, b) => b.score - a.score).map((p, idx) => (
                        <div key={p.userId} className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className={clsx(
                                    "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm",
                                    idx === 0 ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-600"
                                )}>
                                    {idx + 1}
                                </div>
                                <span className="font-medium text-slate-900">
                                    {getDisplayName(p.userId)}
                                </span>
                            </div>
                            <span className="font-bold text-violet-600">{p.score} pts</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return null;
}
