"use client";

import { useState } from "react";
import { ShieldCheck, AlertTriangle, Send, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/app/lib/http/client";

export default function SafetyGuidesPage() {
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      await apiFetch("/contact", {
        method: "POST",
        body: JSON.stringify({
          name: "Safety signal",
          email,
          subject: "Safety report",
          message: description,
          category: "abuse",
        }),
      });
      setStatus("success");
      setMessage("Thanks. A moderator will follow up using the contact backend.");
      setDescription("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to send right now.");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6 lg:px-12">
      <section className="mx-auto flex max-w-5xl flex-col gap-4 rounded-3xl border border-emerald-100 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4" /> Safety guides
          </p>
          <h1 className="text-3xl font-bold text-navy dark:text-white">Protecting your campus crew</h1>
          <p className="max-w-3xl text-sm text-navy/70 dark:text-slate-400">
            The flows below connect directly to the backend contact endpoint so every escalation reaches humans.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="text-lg font-semibold text-navy dark:text-white">Immediate steps</h2>
          <ul className="mt-4 space-y-3 text-sm text-navy/70 dark:text-slate-400">
            <li>• Block and report harmful accounts from any profile or message.</li>
            <li>• Screenshots help: attach them when you open a ticket so staff can verify faster.</li>
            <li>• Abuse reports ping moderation via the same API the admin console uses.</li>
            <li>• System health is live at <a className="font-semibold text-coral hover:underline" href="/status">/status</a> for transparency.</li>
          </ul>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
            <AlertTriangle className="h-4 w-4" />
            Send a safety report
          </div>
          <label className="text-sm font-semibold text-navy dark:text-white">
            Email (for follow-up)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-navy placeholder:text-navy/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-emerald-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-coral"
              placeholder="you@campus.edu"
            />
          </label>
          <label className="text-sm font-semibold text-navy dark:text-white">
            What happened?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={5}
              className="mt-2 w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm text-navy placeholder:text-navy/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 dark:border-emerald-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-coral"
              placeholder="Share details so we can route this quickly..."
            />
          </label>
          {message && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">
              {status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {message}
            </div>
          )}
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-300/40 transition hover:bg-emerald-500 disabled:opacity-60 dark:shadow-emerald-900/40"
          >
            {status === "loading" ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to safety team
          </button>
        </form>
      </section>
    </main>
  );
}
