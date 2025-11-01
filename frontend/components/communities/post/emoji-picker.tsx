"use client";

import { useEffect, useRef } from "react";

const DEFAULT_EMOJIS = ["👍", "🎉", "❤️", "🔥", "👏", "💡", "🤝", "✅", "🚀", "🧠"];

export type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="menu"
      className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
    >
      <p id="emoji-picker-label" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pick a reaction
      </p>
  <div className="grid grid-cols-5 gap-2">
        {DEFAULT_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-lg transition hover:border-midnight"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
