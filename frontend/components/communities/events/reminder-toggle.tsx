"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "communities:event:reminders";

type ReminderPrefs = Record<string, boolean>;

function loadPrefs(): ReminderPrefs {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as ReminderPrefs;
  } catch (error) {
    console.warn("Failed to load reminder prefs", error);
    return {};
  }
}

function savePrefs(prefs: ReminderPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn("Failed to persist reminder prefs", error);
  }
}

export function ReminderToggle({ eventId }: { eventId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const prefs = loadPrefs();
    setEnabled(prefs[eventId] ?? false);
  }, [eventId]);

  useEffect(() => {
    if (enabled === null) {
      return;
    }
    const prefs = loadPrefs();
    prefs[eventId] = enabled;
    savePrefs(prefs);
  }, [enabled, eventId]);

  if (enabled === null) {
    return (
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        disabled
      >
        Loading…
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEnabled((value) => !value)}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
      aria-pressed={enabled}
    >
      {enabled ? "Reminder on" : "Remind me"}
    </button>
  );
}
