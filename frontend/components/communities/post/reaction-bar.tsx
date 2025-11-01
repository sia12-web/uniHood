"use client";

import { useState } from "react";
import clsx from "clsx";

import type { ReactionSummary } from "@/lib/communities";

import { EmojiPicker } from "./emoji-picker";
import { ReactionChip } from "./reaction-chip";
import { useReaction } from "@/hooks/communities/use-reaction";

type ReactionBarSubject =
  | { type: "post"; postId: string }
  | { type: "comment"; postId: string; commentId: string; parentId: string | null };

export type ReactionBarProps = {
  subject: ReactionBarSubject;
  reactions: ReactionSummary[];
};

const DEFAULT_EMOJIS = ["👍", "🎉", "❤️", "🔥", "👏"];

export function ReactionBar({ subject, reactions }: ReactionBarProps) {
  const { addReaction, removeReaction, isProcessing } = useReaction(subject);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const handleToggle = (emoji: string, active: boolean) => {
    if (isProcessing) return;
    if (active) {
      removeReaction(emoji);
    } else {
      addReaction(emoji);
    }
  };

  const hasCustomEmoji = reactions.some((reaction) => !DEFAULT_EMOJIS.includes(reaction.emoji));

  return (
    <div className="relative flex flex-wrap items-center gap-2" role="toolbar" aria-label="Reactions">
      {reactions.map((reaction) => (
        <ReactionChip
          key={reaction.emoji}
          emoji={reaction.emoji}
          count={reaction.count}
          active={reaction.viewer_has_reacted}
          disabled={isProcessing}
          onToggle={() => handleToggle(reaction.emoji, reaction.viewer_has_reacted)}
        />
      ))}
      <button
        type="button"
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition",
          isProcessing ? "opacity-70" : "hover:border-midnight hover:text-midnight",
        )}
        onClick={() => setPickerOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isPickerOpen ? true : undefined}
        disabled={isProcessing}
      >
        +<span className="sr-only">Add reaction</span>
      </button>
      {(isPickerOpen || (!hasCustomEmoji && reactions.length === 0)) && (
        <EmojiPicker
          onSelect={(emoji) => {
            setPickerOpen(false);
            addReaction(emoji);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
