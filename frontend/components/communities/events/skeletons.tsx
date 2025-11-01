"use client";

import clsx from "clsx";

export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={index}
          className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <header className="flex items-center justify-between pb-4">
            <div className="h-4 w-24 rounded-full bg-slate-200" />
            <div className="h-5 w-16 rounded-full bg-slate-200" />
          </header>
          <div className="space-y-3">
            <div className="h-6 w-3/4 rounded-full bg-slate-200" />
            <div className="h-4 w-1/2 rounded-full bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-slate-200" />
              <div className="h-6 w-20 rounded-full bg-slate-200" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DetailSkeleton({ withSidebar = false }: { withSidebar?: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-6 w-3/4 rounded-full bg-slate-200" />
        <div className="h-4 w-1/2 rounded-full bg-slate-200" />
        <div className="h-4 w-full rounded-full bg-slate-200" />
        <div className="h-4 w-2/3 rounded-full bg-slate-200" />
      </section>
      <aside className={clsx("space-y-4", withSidebar ? "block" : "hidden md:block")}> 
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-24 rounded-full bg-slate-200" />
          <div className="mt-4 space-y-2">
            <div className="h-10 w-full rounded-xl bg-slate-200" />
            <div className="h-10 w-full rounded-xl bg-slate-200" />
          </div>
        </div>
      </aside>
    </div>
  );
}
