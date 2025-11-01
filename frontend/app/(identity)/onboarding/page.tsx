"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import {
	listCampuses,
	registerIdentity,
	resendVerification,
	type RegisterPayload,
} from "@/lib/identity";
import type { CampusRow } from "@/lib/types";

type FormState = {
	email: string;
	password: string;
	username: string;
	campusId: string;
};

const INITIAL_FORM: FormState = {
	email: "",
	password: "",
	username: "",
	campusId: "",
};

export default function OnboardingPage() {
	const [form, setForm] = useState<FormState>(INITIAL_FORM);
	const [campuses, setCampuses] = useState<CampusRow[]>([]);
	const [loadingCampuses, setLoadingCampuses] = useState<boolean>(true);
	const [registering, setRegistering] = useState<boolean>(false);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [lastRegisteredEmail, setLastRegisteredEmail] = useState<string | null>(null);
	const [resending, setResending] = useState<boolean>(false);

	useEffect(() => {
		let cancelled = false;
		async function loadCampuses() {
			setLoadingCampuses(true);
			try {
				const rows = await listCampuses();
				if (!cancelled) {
					setCampuses(rows);
					if (rows.length > 0) {
						setForm((prev) => ({ ...prev, campusId: prev.campusId || rows[0].id }));
					}
				}
			} catch (error) {
				if (!cancelled) {
					setErrorMessage(error instanceof Error ? error.message : "Failed to load campuses");
				}
			} finally {
				if (!cancelled) {
					setLoadingCampuses(false);
				}
			}
		}
		void loadCampuses();
		return () => {
			cancelled = true;
		};
	}, []);

	const passwordHint = useMemo(() => form.password.length < 8, [form.password.length]);

	const handleChange = (field: keyof FormState) => (value: string) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleUsernameChange = (value: string) => {
		const normalised = value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
		setForm((prev) => ({ ...prev, username: normalised }));
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);
		setSuccessMessage(null);
		setRegistering(true);
		try {
			const payload: RegisterPayload = {
				email: form.email.trim().toLowerCase(),
				password: form.password,
				handle: form.username.trim().toLowerCase(),
				display_name: form.username.trim().toLowerCase(),
				campus_id: form.campusId,
			};
			const response = await registerIdentity(payload);
			setSuccessMessage(`Account created for ${response.email}. Check your inbox for verification.`);
			setLastRegisteredEmail(response.email);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Registration failed");
		} finally {
			setRegistering(false);
		}
	};

	const handleResend = async () => {
		if (!lastRegisteredEmail) {
			return;
		}
		setResending(true);
		setErrorMessage(null);
		try {
			await resendVerification(lastRegisteredEmail);
			setSuccessMessage(`Verification email re-sent to ${lastRegisteredEmail}.`);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Unable to resend email");
		} finally {
			setResending(false);
		}
	};

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-10">
			<div className="flex items-center justify-between">
				<BrandLogo
					withWordmark
					className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-950"
				/>
			</div>
			<header className="flex flex-col gap-2 text-slate-900">
				<h1 className="text-3xl font-semibold">Join Divan</h1>
				<p className="text-sm text-slate-600">
					Create your account with a verified campus email, choose a username, and start building your profile.
				</p>
			</header>
			{errorMessage ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
			) : null}
			{successMessage ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
			) : null}
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Campus Email</span>
					<input
						required
						type="email"
						value={form.email}
						autoComplete="email"
						placeholder="me@campus.edu"
						onChange={(event) => handleChange("email")(event.target.value)}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Password</span>
					<input
						required
						type="password"
						value={form.password}
						autoComplete="new-password"
						placeholder="At least 8 characters"
						onChange={(event) => handleChange("password")(event.target.value)}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					{passwordHint ? (
						<p className="text-xs text-slate-500">Use at least 8 characters for a strong password.</p>
					) : null}
				</label>
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Username</span>
					<input
						required
						type="text"
						value={form.username}
						placeholder="choose_a_username"
						onChange={(event) => handleUsernameChange(event.target.value)}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<p className="text-xs text-slate-500">Lowercase letters, numbers, underscores, 3-20 characters.</p>
				</label>
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Campus</span>
					<select
						required
						value={form.campusId}
						disabled={loadingCampuses}
						onChange={(event) => handleChange("campusId")(event.target.value)}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					>
						{campuses.length === 0 ? <option value="">No campuses available</option> : null}
						{campuses.map((campus) => (
							<option key={campus.id} value={campus.id}>
								{campus.name}
								{campus.domain ? ` (${campus.domain})` : ""}
							</option>
						))}
					</select>
				</label>
				<button
					type="submit"
					disabled={registering}
					className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
				>
					{registering ? "Creating account…" : "Create account"}
				</button>
			</form>
			{lastRegisteredEmail ? (
				<div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
					<span>Need a new email? Re-send the verification link.</span>
					<button
						onClick={() => void handleResend()}
						disabled={resending}
						className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-900 shadow disabled:opacity-50"
					>
						{resending ? "Sending…" : "Re-send"}
					</button>
				</div>
			) : null}
		</main>
	);
}
