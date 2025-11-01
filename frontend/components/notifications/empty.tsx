"use client";

export function NotificationsEmpty({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
      <p className="text-base font-semibold text-slate-600">Nothing to review yet</p>
      <p className="max-w-sm text-xs text-slate-400">{message ?? "You are all caught up. New updates will land here as they arrive."}</p>
    </div>
  );
}
