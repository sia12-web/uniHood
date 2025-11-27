"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
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
		<main className="min-h-screen w-full bg-white">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
				<section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start">
					<div className="relative flex flex-col">
						<BrandLogo
							withWordmark
							logoWidth={1040}
							logoHeight={1040}
							className="w-full max-w-6xl justify-center text-9xl font-semibold text-[#b7222d] lg:justify-start"
							logoClassName="h-[48rem] w-auto"
						/>
					</div>
				</section>

				<section className="flex flex-1">
					<div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9 text-center">
						<h1 className="text-2xl font-semibold text-slate-900 mb-4">Email Verification</h1>
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
							<p className="mt-4 text-xs text-slate-500">Return to the onboarding tab to finish signing in.</p>
						) : null}
						{status === "error" ? (
							<p className="mt-4 text-xs text-slate-500">
								If the link expired, request a new email from the onboarding screen.
							</p>
						) : null}
					</div>
				</section>
			</div>
		</main>
	);
}
