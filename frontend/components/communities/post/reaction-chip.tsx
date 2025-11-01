"use client";

import clsx from "clsx";

export type ReactionChipProps = {
  emoji: string;
  count: number;
  active?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
};

export function ReactionChip({ emoji, count, active = false, onToggle, disabled = false }: ReactionChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-midnight bg-midnight/10 text-midnight"
          : "border-slate-200 bg-white text-slate-600 hover:border-midnight hover:text-midnight",
      )}
      aria-pressed={active}
    >
      <span aria-hidden>{emoji}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
