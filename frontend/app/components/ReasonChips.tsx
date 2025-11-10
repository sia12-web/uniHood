"use client";

import React from "react";

type ReasonChipsProps<T extends string> = {
  reasons: readonly T[];
  selected: readonly T[];
  onToggle: (reason: T) => void;
};

function ReasonChipsComponent<T extends string>({ reasons, selected, onToggle }: ReasonChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {reasons.map((reason) => {
        const active = selected.includes(reason);
        return (
          <button
            key={reason}
            type="button"
            className={`px-2 py-1 rounded-full border text-xs font-medium transition-colors ${active ? "bg-rose-100 border-rose-400 text-rose-700" : "bg-slate-100 border-slate-300 text-slate-600"}`}
            onClick={() => onToggle(reason)}
            aria-pressed={active ? "true" : "false"}
          >
            {reason.charAt(0).toUpperCase() + reason.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

const ReasonChips = ReasonChipsComponent as <T extends string>(props: ReasonChipsProps<T>) => JSX.Element;

export default ReasonChips;
