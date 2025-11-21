"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
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

  const disabled = useMemo(() => submitting || form.email.trim() === "" || form.password === "", [form.email, form.password, submitting]);
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
		<main className="min-h-screen w-full bg-white">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
				<section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start">
					<div className="relative flex flex-col">
						<BrandLogo
							withWordmark
							logoWidth={380}
							logoHeight={380}
							className="w-full max-w-5xl justify-center text-8xl font-semibold text-[#b7222d] lg:justify-start"
							logoClassName="h-80 w-auto mix-blend-multiply drop-shadow-[0_15px_60px_rgba(183,34,45,0.25)]"
						/>
					</div>
				</section>

        <section className="flex flex-1">
          <div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
            <header className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold text-slate-900">Sign in to Divan</h2>
            </header>

            {error ? (
              <p className="mt-4 rounded-lg border border-[#f0b7bd] bg-[#fbeaec] px-3 py-2 text-sm text-[#7a1d23]">
                {error}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                <span>Email</span>
                <input
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={demoEmail || "name@email.com"}
                  value={form.email}
                  onChange={(event) => handleChange("email")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                <span>Password</span>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(event) => handleChange("password")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
              </label>

              <button
                type="submit"
                disabled={disabled}
                className="mt-2 rounded-xl bg-[#d64045] px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <footer className="mt-6 flex flex-col gap-2 border-t border-[#f0d8d9] pt-4 text-sm text-slate-700">
              <span>
                Need an account?{" "}
                <Link href="/onboarding" className="font-semibold text-[#b7222d] underline-offset-4 hover:underline">
                  Create one
                </Link>
                .
              </span>
              <span>
                Verified your email already?{" "}
                <Link href="/verify" className="font-semibold text-[#b7222d] underline-offset-4 hover:underline">
                  Complete verification
                </Link>
                .
              </span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
