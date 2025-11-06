"use client";

import { useMemo } from "react";
import type { NearbyUser } from "@/lib/types";

interface RadarProps {
  users: NearbyUser[];
  radius: number; // meters
}

// Simple stable hash to spread users around the circle deterministically
function hashToAngle(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  const angle = (h >>> 0) % 360; // 0..359
  return angle * (Math.PI / 180);
}

export default function Radar({ users, radius }: RadarProps) {
  const points = useMemo(() => {
    return users
      .filter((u) => typeof u.distance_m === "number")
      .map((u) => {
        const dist = Math.max(0, Math.min(radius, u.distance_m!));
        const rNorm = dist / radius; // 0..1
        const theta = hashToAngle(u.user_id);
        const x = 50 + rNorm * 45 * Math.cos(theta); // 0..100 viewBox coords
        const y = 50 + rNorm * 45 * Math.sin(theta);
        return { id: u.user_id, x, y, isFriend: !!u.is_friend };
      });
  }, [users, radius]);

  return (
    <div className="relative h-64 w-full">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="rg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.3)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        {/* Background circle */}
        <circle cx="50" cy="50" r="49" fill="url(#rg)" stroke="rgba(222, 205, 178, 0.6)" />
        {/* Concentric rings */}
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(222,205,178,0.5)" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(222,205,178,0.4)" />
        <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(222,205,178,0.3)" />
        <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(222,205,178,0.2)" />

        {/* Points */}
        {points.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={1.6}
            className={p.isFriend ? "fill-emerald-600" : "fill-coral"}
          >
            <title>{p.id}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
