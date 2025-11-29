"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { forgotUsername } from "@/lib/identity";

export default function ForgotUsernamePage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await forgotUsername(email);
      setSubmitted(true);
    } catch {
      // Generic error message
      setError("Unable to process request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start lg:-ml-16">
          <div className="relative flex flex-col">
            <BrandLogo
              backgroundTone="transparent"
              logoWidth={1600}
              logoHeight={1600}
              className="w-full max-w-5xl justify-center text-[#b7222d] lg:justify-start"
              logoClassName="h-screen w-auto sm:h-screen lg:h-screen lg:max-h-[700px]"
            />
          </div>
        </section>

        <section className="flex flex-1">
          <div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
            <header className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold text-slate-900">Recover Username</h2>

            </header>

            {submitted ? (
              <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
                <p>If an account exists with that email, we&apos;ve sent your username.</p>
                <Link href="/login" className="mt-4 block font-medium text-[#b7222d] hover:underline">
                  Return to login
                </Link>
              </div>
            ) : (
              <>
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
                      placeholder="name@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={submitting || !email}
                    className="mt-2 rounded-xl bg-[#d64045] px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Sending..." : "Send Username"}
                  </button>
                </form>
              </>
            )}

            <footer className="mt-6 flex flex-col gap-2 border-t border-[#f0d8d9] pt-4 text-sm text-slate-700">
              <Link href="/login" className="font-semibold text-[#b7222d] underline-offset-4 hover:underline">
                Back to login
              </Link>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
