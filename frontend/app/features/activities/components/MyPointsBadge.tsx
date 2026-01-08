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
  // User requested to remove total score display
  return null;
}

export default MyPointsBadge;
