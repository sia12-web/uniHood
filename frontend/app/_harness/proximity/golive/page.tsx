"use client";

import { useState } from "react";
import GoLiveStrip from "@/components/proximity/GoLiveStrip";

const DEFAULT_OPTIONS = [10, 50, 100];

export default function GoLiveHarnessPage() {
  const [enabled, setEnabled] = useState(true);
  const [heartbeatSeconds, setHeartbeatSeconds] = useState(2);
  const [radius, setRadius] = useState(50);
  const [presenceStatus, setPresenceStatus] = useState<string | null>(
    "You’re visible on the map—others nearby can see you now.",
  );

  const options = DEFAULT_OPTIONS;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">GoLiveStrip Harness</h1>
        <p className="text-sm text-slate-600">
          Interactive playground for the presentational GoLiveStrip component. No real heartbeats are sent.
        </p>
      </header>

      <section className="space-y-3 rounded border border-slate-200 bg-white p-4 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-slate-700">Enabled</span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-700">Heartbeat seconds</span>
            <input
              type="number"
              min={1}
              className="w-24 rounded border border-slate-300 px-2 py-1"
              value={heartbeatSeconds}
              onChange={(e) => setHeartbeatSeconds(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <span className="text-slate-700">Presence status</span>
            <input
              type="text"
              className="flex-1 rounded border border-slate-300 px-2 py-1"
              value={presenceStatus ?? ""}
              placeholder="(none)"
              onChange={(e) => {
                const v = e.target.value;
                setPresenceStatus(v ? v : null);
              }}
            />
          </label>
        </div>
      </section>

      <GoLiveStrip
        enabled={enabled}
        heartbeatSeconds={heartbeatSeconds}
        radius={radius}
        radiusOptions={options}
        presenceStatus={presenceStatus}
        onRadiusChange={setRadius}
        onGoLive={() => undefined}
      />
    </main>
  );
}
