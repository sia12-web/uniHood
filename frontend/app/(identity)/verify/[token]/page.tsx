"use client";

import { useEffect, useState } from "react";

import { verifyEmailToken } from "@/lib/identity";

type VerifyPageProps = {
	params: { token: string };
};

type VerifyStatus = "loading" | "success" | "error";

export default function VerifyPage({ params }: VerifyPageProps) {
	const { token } = params;
	const [status, setStatus] = useState<VerifyStatus>("loading");
	const [message, setMessage] = useState<string>("Verifying your email…");

	useEffect(() => {
		let cancelled = false;
		async function run() {
			setStatus("loading");
			setMessage("Verifying your email…");
			try {
				await verifyEmailToken(token);
				if (!cancelled) {
					setStatus("success");
					setMessage("Email verified! You can close this tab and sign in.");
				}
			} catch (error) {
				if (!cancelled) {
					setStatus("error");
					setMessage(error instanceof Error ? error.message : "Verification failed");
				}
			}
		}
		void run();
		return () => {
			cancelled = true;
		};
	}, [token]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
			<h1 className="text-2xl font-semibold text-slate-900">Email Verification</h1>
			<p
				className={`rounded px-4 py-3 text-sm ${
					status === "success"
						? "border border-emerald-200 bg-emerald-50 text-emerald-700"
						: status === "error"
							? "border border-rose-200 bg-rose-50 text-rose-700"
							: "border border-slate-200 bg-slate-50 text-slate-700"
					}`}
			>
				{message}
			</p>
			{status === "success" ? (
				<p className="text-xs text-slate-500">Return to the onboarding tab to finish signing in.</p>
			) : null}
			{status === "error" ? (
				<p className="text-xs text-slate-500">
					If the link expired, request a new email from the onboarding screen.
				</p>
			) : null}
		</main>
	);
}
