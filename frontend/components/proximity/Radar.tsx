"use client";

import { useMemo } from "react";
import type { NearbyUser } from "@/lib/types";

interface RadarProps {
  users: NearbyUser[];
  radius: number; // meters
  onSelect?: (userId: string) => void;
  activeUserId?: string | null;
}

const DRAW_RADIUS = 32; // relative radius used for plotting pulses
const RING_PERCENTS = [0.35, 0.65, 1];

// Simple stable hash to spread users around the circle deterministically
function hashToAngle(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  const angle = (h >>> 0) % 360; // 0..359
  return angle * (Math.PI / 180);
}

export default function Radar({ users, radius, onSelect, activeUserId }: RadarProps) {
  const points = useMemo(() => {
    return users
      .filter((u) => typeof u.distance_m === "number")
      .map((u) => {
        const dist = Math.max(0, Math.min(radius, u.distance_m!));
        const rNorm = radius > 0 ? dist / radius : 0; // 0..1
        const theta = hashToAngle(u.user_id);
        const drawDistance = DRAW_RADIUS * rNorm;
        const x = 50 + drawDistance * Math.cos(theta);
        const y = 50 + drawDistance * Math.sin(theta);
        return {
          id: u.user_id,
          x,
          y,
          isFriend: !!u.is_friend,
          label: u.display_name || "Nearby classmate",
        };
      });
  }, [users, radius]);

  return (
    <div className="w-full h-64">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        <defs>
          <linearGradient id="panel-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0d172f" />
            <stop offset="100%" stopColor="#050c1c" />
          </linearGradient>
        </defs>
        {/* Outer rounded square */}
        <rect x="5" y="5" width="90" height="90" rx="18" fill="#020713" stroke="rgba(255,255,255,0.05)" />
        {/* Inner square */}
        <rect x="12" y="12" width="76" height="76" rx="16" fill="url(#panel-bg)" stroke="rgba(148,163,184,0.2)" />
        {/* Concentric rings */}
        {RING_PERCENTS.map((pct) => (
          <circle key={pct} cx="50" cy="50" r={DRAW_RADIUS * pct} fill="none" stroke="rgba(148,163,184,0.25)" />
        ))}
        <circle cx="50" cy="50" r="2" fill="#e2e8f0" />

        {/* Points */}
        {points.map((p) => {
          const isActive = activeUserId === p.id;
          const pulseRadius = isActive ? 3.2 : 2;
          const fillColor = p.isFriend ? "#34d399" : "#f472b6";
          const strokeColor = isActive ? "#ffffff" : "transparent";
          const ariaLabel = `${p.label}${p.isFriend ? " (friend)" : ""}`;
          const accessibilityProps = onSelect
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": ariaLabel,
              }
            : {};
          return (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={pulseRadius}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isActive ? 0.7 : 0}
              className={`${onSelect ? "cursor-pointer" : "cursor-default"} transition-[r] duration-150 ease-out`}
              onClick={() => onSelect?.(p.id)}
              onKeyDown={(event) => {
                if (!onSelect) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(p.id);
                }
              }}
              {...accessibilityProps}
              data-friend={p.isFriend ? "true" : undefined}
              data-active={isActive ? "true" : undefined}
            >
              <title>{ariaLabel}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
