"use client";
import NextDynamic from 'next/dynamic';
import Link from 'next/link';

// Dynamic import of named export with correct path.
const QuickTriviaPanel = NextDynamic(async () => (await import('@/app/features/activities/components/QuickTriviaPanel')).QuickTriviaPanel, { ssr: false });

// (No special rendering config needed.)

export default function QuickTriviaEntryPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Quick Trivia</h1>
        <p className="text-sm text-slate-600">Rapid questions. Earn points for correctness and speed. Tie‑breakers decide close matches.</p>
        <Link href="/activities" className="text-xs font-semibold text-sky-600 hover:underline">← All activities</Link>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <QuickTriviaPanel sessionId="demo" />
      </section>
    </main>
  );
}
