"use client";

import { Star } from "lucide-react";
import { useMyPoints } from "../hooks/useMyPoints";

type Props = {
  className?: string;
};

/**
 * A small badge showing the current user's total leaderboard points.
 * Displayed in activity lobbies so users see their progress.
 */
export function MyPointsBadge({ className }: Props) {
  const { loading, totalPoints, error } = useMyPoints();

  if (error) {
    return null; // Silently fail - don't clutter the UI if we can't load points
  }

  const displayValue = loading ? "..." : totalPoints?.toFixed(0) ?? "0";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 ${className ?? ""}`}>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span>Your Points: {displayValue}</span>
    </div>
  );
}

export default MyPointsBadge;
