"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { loginIdentity } from "@/lib/identity";
import { getDemoUserEmail } from "@/lib/env";
import { storeAuthSnapshot } from "@/lib/auth-storage";

const INITIAL_FORM = {
  email: "",
  password: "",
};

type LoginForm = typeof INITIAL_FORM;

export default function LoginPage() {
  const [form, setForm] = useState<LoginForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const disabled = useMemo(() => {
    return submitting || form.email.trim() === "" || form.password === "";
  }, [form.email, form.password, submitting]);

  const demoEmail = useMemo(() => getDemoUserEmail(), []);

  const handleChange = (field: keyof LoginForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      };
      const response = await loginIdentity(payload);
      try {
        const snapshot = {
          ...response,
          stored_at: new Date().toISOString(),
        };
        storeAuthSnapshot(snapshot);
      } catch {
        // localStorage is optional; ignore failures (e.g., SSR or disabled storage).
      }
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2 text-slate-900">
        <h1 className="text-3xl font-semibold">Sign in to Divan</h1>
        <p className="text-sm text-slate-600">
          Enter the email and password you used during onboarding. Tokens are stored locally for quick API
          testing.
        </p>
      </header>
      {error ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Email</span>
          <input
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={demoEmail}
            value={form.email}
            onChange={(event) => handleChange("email")(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Password</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.password}
            onChange={(event) => handleChange("password")(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <p>
          Need an account? <Link href="/onboarding" className="text-slate-900 underline">Create one</Link>.
        </p>
        <p>
          Verified your email already? <Link href="/verify" className="text-slate-900 underline">Complete verification</Link>.
        </p>
      </footer>
    </main>
  );
}
