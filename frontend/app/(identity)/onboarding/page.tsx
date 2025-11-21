"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import { listCampuses, loginIdentity, registerIdentity, type RegisterPayload } from "@/lib/identity";
import { storeAuthSnapshot } from "@/lib/auth-storage";
import { getDemoUserEmail } from "@/lib/env";

const INITIAL_FORM = {
  email: "",
  password: "",
  username: "",
  campusId: "",
};

const DEFAULT_CAMPUS = { id: "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2", name: "McGill University" };

type JoinForm = typeof INITIAL_FORM;

export default function OnboardingPage() {
  const [form, setForm] = useState<JoinForm>(INITIAL_FORM);
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [loadingCampuses, setLoadingCampuses] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const disabled = useMemo(
    () => submitting || !form.email.trim() || !form.password || !form.username.trim() || !form.campusId,
    [form.campusId, form.email, form.username, form.password, submitting],
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

  const demoEmail = useMemo(() => getDemoUserEmail(), []);

const handleChange = (field: keyof JoinForm) => (value: string) => {
  setForm((prev) => ({ ...prev, [field]: value }));
};

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: RegisterPayload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
          handle: form.username.trim(),
          display_name: form.username.trim(),
          campus_id: form.campusId,
        };
      await registerIdentity(payload);
      // Auto-login after registration
      const loginResponse = await loginIdentity({ email: payload.email, password: payload.password });
      const snapshot = { ...loginResponse, stored_at: new Date().toISOString() };
      storeAuthSnapshot(snapshot);
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create your account";
      setError(message);
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
                <span>Campus</span>
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
                <p className="text-xs text-slate-500">Choose your campus. If only one appears, start there.</p>
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
