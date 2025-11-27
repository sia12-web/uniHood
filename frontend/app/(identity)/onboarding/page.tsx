"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import { HttpError } from "@/app/lib/http/errors";
import { listCampuses, loginIdentity, registerIdentity, type RegisterPayload } from "@/lib/identity";
import { storeAuthSnapshot } from "@/lib/auth-storage";

const INITIAL_FORM = {
  email: "",
  password: "",
  confirmPassword: "",
  username: "",
  campusId: "",
};

const DEFAULT_CAMPUS = { id: "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2", name: "McGill University" };

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
      case "handle_taken":
        return "That username is taken. Pick another.";
      case "handle_reserved":
        return "That username is being claimed right now. Try again shortly.";
      case "handle_format_error":
        return "Username must be 3-20 letters, numbers, or underscores.";
      case "password_too_weak":
        return "Please choose a stronger password.";
      case "email_domain_mismatch":
        return "Use your university-issued email to join this campus.";
      case "register_rate":
        return "Too many sign-up attempts. Wait a minute and try again.";
      case "email_unverified":
        return "Check your inbox to verify your email, then sign in.";
      default:
        break;
    }
    if (error.status === 401) {
      return "Authentication required. Try signing in again.";
    }
    if (error.status === 429) {
      return "You hit the limit. Please slow down and try again.";
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
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [loadingCampuses, setLoadingCampuses] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const disabled = useMemo(
    () =>
      submitting ||
      !form.email.trim() ||
      !form.password ||
      !form.confirmPassword ||
      form.password !== form.confirmPassword ||
      !form.username.trim() ||
      !form.campusId,
    [form.campusId, form.email, form.username, form.password, form.confirmPassword, submitting],
  );

  useEffect(() => {
    const load = async () => {
      setLoadingCampuses(true);
      try {
        const rows = await listCampuses();
        const unique = new Map<string, { id: string; name: string }>();
        [DEFAULT_CAMPUS, ...rows].forEach((row) => {
          if (row?.id) {
            unique.set(row.id, { id: row.id, name: row.name || "Campus" });
          }
        });
        const list = Array.from(unique.values());
        setCampuses(list);
        if (!form.campusId && list.length) {
          setForm((prev) => ({ ...prev, campusId: list[0].id }));
        }
      } catch (err) {
        console.error("Failed to load campuses", err);
        setCampuses([DEFAULT_CAMPUS]);
        if (!form.campusId) {
          setForm((prev) => ({ ...prev, campusId: DEFAULT_CAMPUS.id }));
        }
      } finally {
        setLoadingCampuses(false);
      }
    };
    void load();
  }, [form.campusId]);

  // Use a stable placeholder to avoid SSR/CSR mismatch.
  const demoEmail = useMemo(() => "name@university.edu", []);

  const handleChange = (field: keyof JoinForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildHandle = (raw: string, fallbackEmail: string): string => {
    const base = raw?.trim() || fallbackEmail.split("@")[0] || "user";
    let handle = base.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    handle = handle.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    if (handle.length > 20) {
      handle = handle.slice(0, 20);
    }
    return handle;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const handle = buildHandle(form.username, form.email);
      if (form.password !== form.confirmPassword) {
        setError("Passwords do not match.");
        setSubmitting(false);
        return;
      }
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
        setError("Username must be 3-20 characters, letters/numbers/underscores only.");
        setSubmitting(false);
        return;
      }
      const payload: RegisterPayload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        handle,
        display_name: form.username.trim() || handle,
        campus_id: form.campusId,
      };
      await registerIdentity(payload);
      // Auto-login after registration
      const loginResponse = await loginIdentity({ email: payload.email, password: payload.password });
      const snapshot = { ...loginResponse, stored_at: new Date().toISOString() };
      storeAuthSnapshot(snapshot);
      router.replace("/onboarding/courses");
    } catch (err) {
      setError(describeJoinError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-white text-base">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        <section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start">
			<div className="relative flex flex-col">
				<BrandLogo
					withWordmark
					logoWidth={520}
					logoHeight={520}
					className="w-full max-w-6xl justify-center text-9xl font-semibold text-[#b7222d] lg:justify-start"
					logoClassName="h-96 w-auto"
				/>
			</div>
		</section>

        <section className="flex flex-1">
          <div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
            <header className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold text-slate-900">Join Divan</h2>
              <p className="text-sm text-slate-600">Use your university email to claim a seat and meet classmates.</p>
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
                  placeholder={demoEmail || "name@university.edu"}
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

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                <span>Username</span>
                <input
                  required
                  type="text"
                  autoComplete="username"
                  placeholder="username"
                  value={form.username}
                  onChange={(event) => handleChange("username")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                <span>University</span>
                <select
                  required
                  value={form.campusId}
                  onChange={(event) => handleChange("campusId")(event.target.value)}
                  className="rounded-xl border border-[#e7d7d8] bg-[#fffdfb] px-3 py-3 text-sm text-slate-900 shadow-sm transition focus:border-[#d64045] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf]"
                >
                  <option value="" disabled>
                    {loadingCampuses ? "Loading campuses..." : "Select campus"}
                  </option>
                  {campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Choose your university. If only one appears, start there.</p>
              </label>

              <button
                type="submit"
                disabled={disabled}
                className="mt-2 rounded-xl bg-[#d64045] px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Joining..." : "Join Divan"}
              </button>
            </form>

            <p className="mt-4 text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-[#d64045] hover:text-[#c7343a]">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
