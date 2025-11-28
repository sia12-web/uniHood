"use client";

import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
      <div className="text-center">
        <p className="text-red-600">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="mt-4 block font-medium text-[#b7222d] hover:underline">
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
      <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
        <p>Password reset successfully! Redirecting to login...</p>
        <Link href="/login" className="mt-4 block font-medium text-[#b7222d] hover:underline">
          Go to login now
        </Link>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p className="mt-4 rounded-lg border border-[#f0b7bd] bg-[#fbeaec] px-3 py-2 text-sm text-[#7a1d23]">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
          <span>New Password</span>
          <input
            required
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
          <span>Confirm Password</span>
          <input
            required
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
          />
        </label>

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-2 rounded-xl bg-[#d64045] px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Resetting..." : "Reset Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen w-full bg-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start">
          <div className="relative flex flex-col">
            <BrandLogo
              withWordmark
              backgroundTone="light"
              logoWidth={320}
              logoHeight={320}
              className="w-full max-w-5xl justify-center text-[#b7222d] lg:justify-start"
              logoClassName="h-20 w-auto sm:h-28 lg:h-32"
              wordmarkTitleClassName="text-4xl sm:text-5xl lg:text-6xl"
              taglineClassName="text-[0.55rem] tracking-[0.6em] sm:text-[0.65rem]"
              tagline="Campus proximity"
            />
          </div>
        </section>

        <section className="flex flex-1">
          <div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
            <header className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold text-slate-900">Set New Password</h2>
            </header>
            <Suspense fallback={<div>Loading...</div>}>
              <ResetPasswordForm />
            </Suspense>
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
