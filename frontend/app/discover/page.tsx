"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import DiscoverySwipeDeck from "@/components/DiscoverySwipeDeck";

export default function DiscoveryPage() {
  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-4">
          <Link 
            href="/" 
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Global Network</h1>
            <p className="text-xs text-slate-500">Discover students from all campuses</p>
          </div>
        </div>
      </div>

      {/* Swipe Deck Container */}
      <div className="mx-auto mt-8 max-w-md px-4">
        <DiscoverySwipeDeck className="h-[600px] w-full shadow-xl" />
      </div>
    </main>
  );
}
