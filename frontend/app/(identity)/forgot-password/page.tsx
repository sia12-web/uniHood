"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Target, Users, Gamepad2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { forgotPassword } from "@/lib/identity";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email);
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
      {/* Left visual side - Pure white to match logo background */}
      <section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-white relative overflow-hidden text-center">
        {/* Subtle accent at edges only - keeping logo area pure white */}
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-to-tr from-rose-50/50 to-transparent" />
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-gradient-to-bl from-slate-50/50 to-transparent" />

        <div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
          {/* Logo - no blending needed since bg is pure white */}
          <div className="mb-8">
            <BrandLogo
              asLink={false}
              backgroundTone="light"
              logoWidth={400}
              logoHeight={400}
              disableMixBlend={true}
              logoClassName="!h-[280px] w-auto"
            />
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
              <span className="text-[#881337]">Connect.</span> <span className="text-slate-700">Play.</span> <span className="text-[#1b2a3a]">Belong.</span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed font-medium">
              The ultimate campus companion for socializing, gaming, and discovering what&apos;s happening around you.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-6 w-full px-4">
            <div className="flex flex-col items-center gap-3 group">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-[#1b2a3a] shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                <Target className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Discover</span>
            </div>
            <div className="flex flex-col items-center gap-3 group">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-[#881337] shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                <Users className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Connect</span>
            </div>
            <div className="flex flex-col items-center gap-3 group">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
                <Gamepad2 className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Compete</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right form side */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-white shadow-2xl z-20">
        <div className="w-full max-w-[420px] space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="lg:hidden flex justify-center mb-6">
            <BrandLogo
              asLink={false}
              backgroundTone="light"
              logoWidth={450}
              logoHeight={450}
              disableMixBlend={true}
              logoClassName="!h-64 !w-64 object-contain"
            />
          </div>
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Reset Password</h2>
            <p className="text-slate-500">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          {submitted ? (
            <div className="rounded-2xl border border-green-100 bg-green-50/50 p-4 text-sm font-medium text-green-700 animate-in fade-in">
              <p>If an account exists with that email, we&apos;ve sent password reset instructions.</p>
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
                  ) : "Send Reset Link"}
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
              Remember your password?{" "}
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
