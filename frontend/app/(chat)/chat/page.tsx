import Link from "next/link";

import { getDemoChatPeerId } from "@/lib/env";

const demoPeerId = getDemoChatPeerId();

export default function ChatOverviewPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12 text-navy">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy/60">Part 2 · Real-time chat</p>
        <h1 className="text-3xl font-bold text-navy">Spin up authenticated direct messages</h1>
        <p className="max-w-3xl text-sm text-navy/70">
          The chat experience plugs into the same socket infrastructure as rooms. Use this page to understand how to
          launch a conversation and which headers are required when talking to the FastAPI backend.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-warm-sand bg-white/90 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy">Quick start</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-navy/70">
          <li>Ensure the Docker stack and socket server are running (`docker compose ... up -d`).</li>
          <li>Pick a target peer ID from your seed data or API (`/chat/conversations`).</li>
          <li>
            Navigate to the conversation route using the pattern
            <code className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-xs">/chat/&lt;peer-id&gt;</code>.
          </li>
        </ol>
        {demoPeerId ? (
          <>
            <div className="rounded border border-dashed border-warm-sand bg-cream px-3 py-2 text-xs text-navy/70">
              <p className="font-semibold uppercase tracking-wide text-coral/80">Demo route</p>
              <p>
                <code>{`/chat/${demoPeerId}`}</code>
              </p>
            </div>
            <Link
              href={`/chat/${demoPeerId}`}
              className="w-fit text-sm font-medium text-navy hover:text-midnight"
            >
              Open demo conversation →
            </Link>
          </>
        ) : (
          <div className="rounded border border-dashed border-coral/40 bg-amber-50 px-3 py-2 text-xs text-coral">
            <p className="font-semibold uppercase tracking-wide">Demo ID needed</p>
            <p>
              Set <code>NEXT_PUBLIC_DEMO_CHAT_PEER_ID</code> in your <code>.env.local</code> to jump straight into a seeded
              chat.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-warm-sand bg-cream p-6 text-sm text-navy/70">
        <h2 className="text-lg font-semibold text-navy">Required headers</h2>
        <p>Every chat API request expects divan-specific headers so the backend can scope data:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>X-User-Id</code>: currently stubbed to <code>11111111-1111-1111-1111-111111111111</code> in the client implementation.
          </li>
          <li>
            <code>X-Campus-Id</code>: defaults to <code>00000000-0000-0000-0000-000000000000</code> until auth wiring lands.
          </li>
        </ul>
        <p className="text-xs text-navy/60">
          Update these values once real authentication is connected. The UI is fully scaffolded and ready to display live
          data.
        </p>
      </section>
    </main>
  );
}
