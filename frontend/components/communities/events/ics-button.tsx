"use client";

import { useState } from "react";

import { downloadEventIcs } from "@/lib/communities";

export function IcsButton({ eventId }: { eventId: string }) {
  const [downloading, setDownloading] = useState(false);

  return (
    <button
      type="button"
      disabled={downloading}
      onClick={async () => {
        setDownloading(true);
        try {
          const blob = await downloadEventIcs(eventId);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "event.ics";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } finally {
          setDownloading(false);
        }
      }}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {downloading ? "Preparing…" : "Add to calendar"}
    </button>
  );
}
