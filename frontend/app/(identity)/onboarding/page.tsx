"use client";

import { FormEvent, useMemo, useState } from "react";

import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import { HttpError } from "@/app/lib/http/errors";
import { registerIdentity, resendVerification, type RegisterPayload } from "@/lib/identity";

const INITIAL_FORM = {
  email: "",
  password: "",
  confirmPassword: "",
};

type JoinForm = typeof INITIAL_FORM;

const extractDetailCode = (detail: unknown): string | null => {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const code = record.detail ?? record.code ?? record.message;
    return typeof code === "string" ? code : null;
  }
  return null;
};

const describeJoinError = (error: unknown): string => {
  if (error instanceof HttpError) {
    const code = extractDetailCode(error.detail);
    switch (code) {
      case "email_taken":
        return "That email already has an account. Try signing in.";
      case "password_too_weak":
        return "Please choose a stronger password.";
      case "register_rate":
        return "Too many sign-up attempts. Wait a minute and try again.";
      default:
        break;
    }
    return error.message || "We couldn’t create your account.";
  }
  if (error instanceof Error) {
    return error.message || "We couldn’t create your account.";
  }
  return "We couldn’t create your account.";
};

export default function OnboardingPage() {
  const [form, setForm] = useState<JoinForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);


  const disabled = useMemo(
    () =>
      submitting ||
      !form.email.trim() ||
      !form.password ||
      !form.confirmPassword ||
      form.password !== form.confirmPassword,
    [form.email, form.password, form.confirmPassword, submitting],
  );

  // Use a stable placeholder to avoid SSR/CSR mismatch.
  const demoEmail = useMemo(() => "name@university.edu", []);

  const handleChange = (field: keyof JoinForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (form.password !== form.confirmPassword) {
        setError("Passwords do not match.");
        setSubmitting(false);
        return;
      }

      const payload: RegisterPayload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      };
      await registerIdentity(payload);

      setSuccess(true);
    } catch (err) {
      setError(describeJoinError(err));
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      await resendVerification(form.email);
      setResendMessage("Verification email resent!");
    } catch {
      setResendMessage("Failed to resend email.");
    } finally {
      setResending(false);
    }
  };

  const handleChangeEmail = () => {
    setSuccess(false);
    setResendMessage(null);
  };

  if (success) {
    return (
      <main className="min-h-screen w-full bg-white text-base flex flex-col items-center justify-center p-4">
        <BrandLogo
          asLink={false}
          backgroundTone="transparent"
          logoWidth={480}
          logoHeight={480}
          className="justify-center text-[#b7222d]"
          logoClassName="h-72 w-auto"
        />
        <div className="mt-8 max-w-md text-center">
          <h2 className="text-3xl font-bold text-slate-900">Check your email</h2>
          <p className="mt-4 text-lg text-slate-600">
            We sent a verification link to <span className="font-semibold">{form.email}</span>.
          </p>
          <p className="mt-2 text-slate-600">
            Click the link to verify your account and continue.
          </p>
          <div className="mt-8 flex flex-col gap-4 items-center">
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-[#d64045] font-medium hover:underline disabled:opacity-50"
            >
              {resending ? "Resending..." : "Resend Verification Email"}
            </button>
            {resendMessage && <p className="text-sm text-slate-500">{resendMessage}</p>}

            <button
              onClick={handleChangeEmail}
              className="text-slate-500 text-sm hover:text-slate-700"
            >
              Change Email
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-white text-base">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-8">
        <section className="flex flex-1 flex-col items-center justify-center text-slate-900 lg:justify-center">
          <div className="relative flex flex-col items-center">
            <BrandLogo
              asLink={false}
              backgroundTone="transparent"
              logoWidth={800}
              logoHeight={800}
              className="w-full justify-center text-[#b7222d]"
              logoClassName="h-48 w-auto sm:h-72 lg:h-[425px]"
            />
          </div>
        </section>

        <section className="flex flex-1 justify-center">
          <div className="w-full max-w-md rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
            <header className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold text-slate-900">Join Radius</h2>
              <p className="text-sm text-slate-600">Create an account to get started.</p>
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
                  placeholder={demoEmail || "name@example.com"}
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
                  autoComplete="new-password"
                  placeholder="Create a password"
                  value={form.password}
                  onChange={(event) => handleChange("password")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                <span>Confirm password</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={(event) => handleChange("confirmPassword")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
              </label>

              <button
                type="submit"
                disabled={disabled}
                className="mt-2 rounded-xl bg-[#d64045] px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Joining..." : "Join Radius"}
              </button>
            </form>

            <p className="mt-4 text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-[#d64045] hover:text-[#c7343a]">
                Sign in
              </Link>
            </p>

            <p className="mt-6 text-xs text-slate-500">
              By joining, you agree to our{" "}
              <Link href="/terms" className="underline hover:text-[#d64045]">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-[#d64045]">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
