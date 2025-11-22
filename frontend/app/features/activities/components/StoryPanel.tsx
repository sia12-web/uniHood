"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, User, Heart, Send, BookOpen, PenTool, Sparkles } from "lucide-react";
import { useStorySession } from "@/app/features/activities/hooks/useStorySession";

export function StoryPanel() {
  const session = useStorySession();
  const [turnContent, setTurnContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    loading,
    error,
    role,
    scenario,
    lines,
    currentTurn,
    joinRole,
    submitTurn,
  } = session;

  // Auto-scroll to bottom when lines change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm font-medium">Loading story...</p>
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

  // 1. Role Selection
  if (!role) {
    return (
      <div className="py-12">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Choose Your Character</h2>
          <p className="text-slate-600">Select a role to begin the story.</p>
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2">
          <button
            onClick={() => joinRole("boy")}
            className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-8 transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
              <User className="h-10 w-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-700">Boy</h3>
              <p className="text-sm text-slate-500">Play as the male protagonist</p>
            </div>
          </button>

          <button
            onClick={() => joinRole("girl")}
            className="group relative flex flex-col items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-8 transition-all hover:-translate-y-1 hover:border-pink-400 hover:shadow-lg"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-50 text-pink-600 transition-colors group-hover:bg-pink-100">
              <Heart className="h-10 w-10" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-pink-700">Girl</h3>
              <p className="text-sm text-slate-500">Play as the female protagonist</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // 2. Waiting for game start (if no scenario yet)
  if (!scenario) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-violet-50">
          <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Waiting for Partner</h3>
        <p className="mt-2 text-slate-600">
          You are playing as <span className={`font-bold ${role === 'boy' ? 'text-blue-600' : 'text-pink-600'}`}>{role === 'boy' ? 'Boy' : 'Girl'}</span>
        </p>
        <p className="mt-1 text-sm text-slate-500">The story will begin once they join.</p>
      </div>
    );
  }

  // 3. Game Board
  return (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
      {/* Header / Scenario */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Scenario</h2>
            <p className="text-sm font-medium leading-relaxed text-slate-800">{scenario}</p>
          </div>
        </div>
      </div>

      {/* Story Lines */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 scroll-smooth"
      >
        <div className="flex flex-col gap-6">
          {lines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
              <Sparkles className="mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">Once upon a time...</p>
            </div>
          )}
          
          {lines.map((line, i) => {
            const isBoy = line.idx % 2 !== 0; // Assuming odd idx is Boy, even is Girl? Or based on role?
            // Let's check the original code:
            // const isBoy = line.idx % 2 !== 0;
            // const isMe = (role === "boy" && isBoy) || (role === "girl" && !isBoy);
            // Wait, usually idx starts at 0 or 1. 
            // If idx 1 is Boy, then idx 2 is Girl.
            
            const isMe = (role === "boy" && isBoy) || (role === "girl" && !isBoy);
            
            return (
              <div
                key={i}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex max-w-[80%] flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <span className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${
                    isBoy ? "text-blue-600" : "text-pink-600"
                  }`}>
                    {isBoy ? "Boy" : "Girl"}
                  </span>
                  <div
                    className={`rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm ${
                      isMe
                        ? "rounded-tr-none bg-violet-600 text-white"
                        : "rounded-tl-none bg-white text-slate-800 ring-1 ring-slate-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{line.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 bg-white p-4">
        {currentTurn?.isMyTurn ? (
          <div className="flex gap-3">
            <div className="relative flex-1">
              <textarea
                placeholder="Write the next part..."
                className="block w-full resize-none rounded-xl border-0 bg-slate-100 py-3 pl-4 pr-12 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-violet-600 sm:text-sm sm:leading-6"
                rows={2}
                value={turnContent}
                onChange={(e) => setTurnContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (turnContent.trim()) {
                      submitTurn(turnContent);
                      setTurnContent("");
                    }
                  }
                }}
                autoFocus
              />
              <div className="absolute bottom-2 right-2">
                <span className="text-[10px] text-slate-400">Enter to send</span>
              </div>
            </div>
            <button
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-500 disabled:bg-slate-200 disabled:text-slate-400"
              disabled={!turnContent.trim()}
              onClick={() => {
                submitTurn(turnContent);
                setTurnContent("");
              }}
              aria-label="Send Turn"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-4 text-sm text-slate-500">
            <PenTool className="h-4 w-4 animate-bounce" />
            <span>Partner is writing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
