"use client";

import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Target, Users, Gamepad2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { resetPassword } from "@/lib/identity";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 text-sm font-medium text-red-700">
          Invalid or missing reset token.
        </div>
        <Link href="/forgot-password" className="block font-bold text-[#b7222d] hover:underline decoration-2 underline-offset-4">
          Request a new link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setSubmitted(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Unable to reset password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="rounded-2xl border border-green-100 bg-green-50/50 p-4 text-sm font-medium text-green-700">
          <p>Password reset successfully! Redirecting to login...</p>
        </div>
        <Link href="/login" className="block font-bold text-[#b7222d] hover:underline decoration-2 underline-offset-4">
          Go to login now
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 text-sm font-medium text-red-700 animate-in shake">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="space-y-4">
          <div className="group relative">
            <input
              required
              type="password"
              id="password"
              autoComplete="new-password"
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer w-full rounded-xl border-none bg-[#eef2f6] px-4 pt-7 pb-3 text-base font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#d64045]/20"
            />
            <label
              htmlFor="password"
              className="pointer-events-none absolute left-4 top-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-all"
            >
              New Password
            </label>
          </div>

          <div className="group relative">
            <input
              required
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              placeholder=" "
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="peer w-full rounded-xl border-none bg-[#eef2f6] px-4 pt-7 pb-3 text-base font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-[#d64045]/20"
            />
            <label
              htmlFor="confirmPassword"
              className="pointer-events-none absolute left-4 top-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-all"
            >
              Confirm Password
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-2 w-full rounded-xl bg-[#c1272d] py-3.5 text-lg font-bold text-white shadow-lg shadow-rose-900/20 transition-all hover:bg-[#a01e23] hover:shadow-xl hover:shadow-rose-900/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Resetting...
            </span>
          ) : "Reset Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
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
              logoClassName="!h-48 !w-auto object-contain"
            />
          </div>
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Set New Password</h2>
            <p className="text-slate-500">
              Choose a strong password for your account.
            </p>
          </div>
          <Suspense fallback={<div className="text-slate-500">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>

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
