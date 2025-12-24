"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock } from "lucide-react";

import { loginIdentity } from "@/lib/identity";
import { storeAuthSnapshot } from "@/lib/auth-storage";
import { HttpError } from "@/app/lib/http/errors";

const INITIAL_FORM = {
    email: "",
    password: "",
};

type LoginForm = typeof INITIAL_FORM;

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    try {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "===".slice((normalized.length + 3) % 4);
        const json = atob(padded);
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
};

const rolesFromToken = (token?: string): string[] => {
    if (!token) return [];
    const payload = decodeJwtPayload(token);
    const roles = payload?.roles;
    if (Array.isArray(roles)) {
        return roles.filter((role): role is string => typeof role === "string");
    }
    if (typeof roles === "string") {
        return roles.split(",").map((role) => role.trim()).filter((role) => role.length > 0);
    }
    return [];
};

export default function AdminLoginPage() {
    const [form, setForm] = useState<LoginForm>(INITIAL_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const disabled = useMemo(() => submitting || form.email.trim() === "" || form.password === "", [form.email, form.password, submitting]);

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

            // Admin Check: Although middleware protects the route, we can do a quick check here for UX
            // to avoid redirecting a non-admin user to a 403 page (or back to home)
            const roles = Array.isArray(response.roles) ? response.roles : rolesFromToken(response.access_token);
            if (!roles.includes("admin")) {
                setError("Access denied. You do not have administrator privileges.");
                return;
            }

            try {
                const snapshot = {
                    ...response,
                    stored_at: new Date().toISOString(),
                };
                storeAuthSnapshot(snapshot);
            } catch {
                // ignore storage errors
            }

            router.replace("/admin");
        } catch (err: unknown) {
            if (err instanceof HttpError) {
                if (err.status === 401) {
                    setError("Invalid credentials.");
                } else {
                    setError(err.message || "Login failed.");
                }
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-2xl shadow-xl ring-1 ring-slate-900/5">
                <div className="flex flex-col items-center text-center">
                    <div className="rounded-full bg-violet-100 p-3 mb-4">
                        <ShieldCheck className="h-8 w-8 text-violet-600" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                        Admin Portal
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Restricted access for authorized personnel only.
                    </p>
                </div>

                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700 flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                                Email Address
                            </label>
                            <input
                                required
                                type="email"
                                id="email"
                                autoComplete="email"
                                value={form.email}
                                onChange={(event) => handleChange("email")(event.target.value)}
                                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 sm:text-sm"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                Password
                            </label>
                            <input
                                required
                                type="password"
                                id="password"
                                autoComplete="current-password"
                                value={form.password}
                                onChange={(event) => handleChange("password")(event.target.value)}
                                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 sm:text-sm"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={disabled}
                        className="w-full flex justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? "Authenticating..." : "Sign in to Console"}
                    </button>
                </form>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                    <p className="text-sm font-semibold text-slate-900">Development access</p>
                    <p className="mt-2">
                        There is no default admin account. Access is restricted to users granted the admin role in the database.
                    </p>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="font-semibold text-slate-800">Test account (test_login.json)</div>
                        <div className="mt-1">
                            Email: <code className="font-mono">test@test.com</code>
                        </div>
                        <div>
                            Password: <code className="font-mono">test123</code>
                        </div>
                    </div>
                    <p className="mt-3">
                        Promote the test user before logging in: run{" "}
                        <code className="font-mono">python promote_admin.py</code> from the project root.
                    </p>
                </div>

                <div className="text-center">
                    <a href="/login" className="text-xs text-slate-400 hover:text-slate-600">
                        Return to standard login
                    </a>
                </div>
            </div>
        </main>
    );
}
