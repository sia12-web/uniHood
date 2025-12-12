"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Target, Users, Gamepad2 } from "lucide-react";
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
    <main className="min-h-screen w-full bg-[#f8f9fa] flex items-stretch">
      {/* Left visual side */}
      <section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-gradient-to-br from-[#ffe4e6] via-[#fff1f2] to-[#ffe4e6] p-16 relative overflow-hidden text-center">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#fecdd3] to-transparent rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-full h-96 bg-gradient-to-t from-white to-transparent opacity-60" />

        <div className="relative z-10 flex flex-col items-center">
          <BrandLogo
            withWordmark={false}
            asLink={false}
            backgroundTone="transparent"
            logoWidth={256}
            logoHeight={256}
            className="text-[#881337] mb-12"
            logoClassName="!h-32 w-auto"
            wordmarkTitleClassName="text-7xl tracking-tight text-[#881337]"
            taglineClassName="hidden"
          />
          <div className="max-w-md">
            <h2 className="text-2xl font-medium text-slate-800 leading-snug">
              Where your academic world <br />
              meets your social life.
            </h2>
          </div>

          <div className="mt-12 grid gap-8 text-left max-w-sm w-full">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Live Campus Radar</h3>
                <p className="text-sm text-slate-600 leading-relaxed">Instantly discover classmates, events, and activities happening nearby.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Find Your Community</h3>
                <p className="text-sm text-slate-600 leading-relaxed">Connect with your crowd, join groups, and never miss a campus moment.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
                <Gamepad2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Game Station</h3>
                <p className="text-sm text-slate-600 leading-relaxed">Play mini-games, climb leaderboards, and earn points with friends.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right form side */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-white shadow-2xl z-20">
        <div className="w-full max-w-[420px] space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="lg:hidden flex justify-center mb-2">
            <BrandLogo
              withWordmark={false}
              asLink={false}
              backgroundTone="transparent"
              logoWidth={64}
              logoHeight={64}
              className="text-[#881337]"
              logoClassName="h-16 w-auto"
              wordmarkTitleClassName="text-4xl tracking-tight text-[#881337]"
              taglineClassName="hidden"
            />
          </div>
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Recover Username</h2>
            <p className="text-slate-500">
              Enter your email address and we&apos;ll send you your username.
            </p>
          </div>

          {submitted ? (
            <div className="rounded-2xl border border-green-100 bg-green-50/50 p-4 text-sm font-medium text-green-700 animate-in fade-in space-y-4">
              <p>If an account exists with that email, we&apos;ve sent your username.</p>
              <Link href="/login" className="block font-bold text-[#b7222d] hover:underline decoration-2 underline-offset-4">
                Return to login
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 text-sm font-medium text-red-700 animate-in shake">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="group relative">
                  <input
                    required
                    type="email"
                    id="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="peer w-full rounded-xl border-none bg-[#eef2f6] px-4 pt-7 pb-3 text-base font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#d64045]/20"
                  />
                  <label
                    htmlFor="email"
                    className="pointer-events-none absolute left-4 top-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-all"
                  >
                    Email Address
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !email}
                  className="mt-2 w-full rounded-xl bg-[#c1272d] py-3.5 text-lg font-bold text-white shadow-lg shadow-rose-900/20 transition-all hover:bg-[#a01e23] hover:shadow-xl hover:shadow-rose-900/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : "Send Username"}
                </button>
              </form>
            </>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">or</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-600 font-medium">
              Remember your username?{" "}
              <Link href="/login" className="text-[#b7222d] font-bold hover:underline decoration-2 underline-offset-4">
                Sign in
              </Link>
            </p>
            <div className="mt-8 flex gap-6 justify-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
              <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
