"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, User, Heart, Send, BookOpen, PenTool, Sparkles, Star, Trophy, Check } from "lucide-react";
import { useStoryBuilderSession } from "@/app/features/activities/hooks/useStoryBuilderSession";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

export function StoryBuilderPanel({ sessionId }: { sessionId: string }) {
  const { state, toggleReady, submitParagraph, voteParagraph, selfId } = useStoryBuilderSession(sessionId);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    status,
    phase,
    participants,
    paragraphs,
    currentTurnUserId,
    winnerUserId,
    connected,
    error
  } = state;

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
    return (
      <div className="flex flex-col items-center justify-center gap-8 py-12 text-center max-w-2xl mx-auto">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-violet-50 text-violet-600 shadow-inner">
          <BookOpen className="h-12 w-12" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">Story Builder</h2>
          <p className="text-slate-600">Collaboratively write a story, then vote on the best parts!</p>
        </div>

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
                            {p.userId === selfId ? "You" : `User ${p.userId.slice(0, 4)}`}
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
            <button
            onClick={toggleReady}
            className={clsx(
                "rounded-2xl px-8 py-4 text-lg font-bold text-white shadow-lg transition-all transform hover:scale-105 active:scale-95",
                me?.ready ? "bg-slate-400 hover:bg-slate-500" : "bg-violet-600 hover:bg-violet-500"
            )}
            >
            {me?.ready ? "Waiting for others..." : "I'm Ready!"}
            </button>
        )}
      </div>
    );
  }

  // Writing Phase
  if (status === 'writing') {
    return (
        <div className="flex flex-col h-[80vh] max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
                        <PenTool className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900">Writing Phase</h3>
                        <p className="text-xs text-slate-500">
                            {isMyTurn ? "It's your turn!" : `Waiting for ${currentTurnUserId === selfId ? "You" : "others"}...`}
                        </p>
                    </div>
                </div>
                <div className="text-sm font-medium text-slate-500">
                    Round {state.turnIndex + 1}
                </div>
            </div>

            {/* Story Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
                {paragraphs.length === 0 && (
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
                                {p.userId === selfId ? "You" : `User ${p.userId.slice(0, 4)}`}
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
                                    {isMine ? "Your Paragraph" : `By User ${p.userId.slice(0, 4)}`}
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

    return (
        <div className="max-w-3xl mx-auto py-12 space-y-10">
            <div className="text-center space-y-4">
                <div className="inline-flex p-4 rounded-full bg-yellow-100 text-yellow-600 mb-4">
                    <Trophy className="h-12 w-12" />
                </div>
                <h2 className="text-4xl font-bold text-slate-900">
                    {isWinner ? "You Won!" : "Story Complete!"}
                </h2>
                <p className="text-xl text-slate-600">
                    Winner: <span className="font-bold text-violet-600">{winnerUserId === selfId ? "You" : `User ${winnerUserId?.slice(0, 4)}`}</span> with {winner?.score} points!
                </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
                <div className="p-8 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-2xl font-serif font-bold text-slate-800 text-center">The Final Story</h3>
                </div>
                <div className="p-10 space-y-6">
                    {paragraphs.map((p, idx) => (
                        <div key={idx} className="relative pl-6 border-l-4 border-violet-200">
                            <p className="text-lg font-serif text-slate-800 leading-relaxed">{p.text}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400 uppercase">
                                    {p.userId === selfId ? "You" : `User ${p.userId.slice(0, 4)}`}
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
                                {p.userId === selfId ? "You" : `User ${p.userId.slice(0, 4)}`}
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
