"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface NetworkProgressCircleProps {
  score: number;
  maxScore?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function NetworkProgressCircle({
  score,
  maxScore = 100,
  size = 120,
  strokeWidth = 8,
  className,
}: NetworkProgressCircleProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(score / maxScore, 1);
  const dashoffset = circumference - progress * circumference;

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transition-all duration-1000 ease-out"
      >
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-100"
        />
        {/* Progress Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          className="text-rose-500 transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold text-slate-900">{score}</span>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Social Score</span>
      </div>
    </div>
  );
}
