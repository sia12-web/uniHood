"use client";

import DiscoveryFeed from "@/components/DiscoveryFeed";
import Link from "next/link";

export default function DiscoveryPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-lg font-bold text-slate-900">Discovery</h1>
        <div className="w-20" /> {/* Spacer for centering if needed */}
      </div>
      <DiscoveryFeed />
    </main>
  );
}
