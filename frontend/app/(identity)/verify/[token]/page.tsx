"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { verifyEmailToken } from "@/lib/identity";
import { storeAuthSnapshot } from "@/lib/auth-storage";

type VerifyPageProps = {
	params: { token: string };
};

type VerifyStatus = "loading" | "success" | "error";

export default function VerifyPage({ params }: VerifyPageProps) {
	const { token } = params;
	const router = useRouter();
	const [status, setStatus] = useState<VerifyStatus>("loading");
	const [message, setMessage] = useState<string>("Verifying your email…");
	const [countdown, setCountdown] = useState(3);
	const [redirectPath, setRedirectPath] = useState("/login");

	useEffect(() => {
		let cancelled = false;
		async function run() {
			setStatus("loading");
			setMessage("Verifying your email…");
			try {
				const result = await verifyEmailToken(token);
				if (!cancelled) {
					setStatus("success");
					if (result.access_token) {
						setMessage("Email verified! Redirecting to onboarding...");
						setRedirectPath("/select-university");
						storeAuthSnapshot({
							access_token: result.access_token,
							refresh_token: result.refresh_token || "",
							token_type: "bearer",
							expires_in: result.expires_in || 900,
							user_id: result.user_id,
							stored_at: new Date().toISOString(),
						});
					} else {
						setMessage("Email verified! Redirecting to sign in...");
					}
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

	// Auto-redirect after successful verification
	useEffect(() => {
		if (status === "success") {
			const countdownInterval = setInterval(() => {
				setCountdown((prev) => {
					if (prev <= 1) {
						clearInterval(countdownInterval);
						clearInterval(countdownInterval);
						router.push(redirectPath);
						return 0;
					}
					return prev - 1;
				});
			}, 1000);

			return () => clearInterval(countdownInterval);
		}
	}, [status, router, redirectPath]);

	return (
		<main className="min-h-screen w-full bg-white">
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
					<div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9 text-center">
						<h1 className="text-2xl font-semibold text-slate-900 mb-4">Email Verification</h1>
						<p
							className={`rounded px-4 py-3 text-sm ${status === "success"
								? "border border-emerald-200 bg-emerald-50 text-emerald-700"
								: status === "error"
									? "border border-rose-200 bg-rose-50 text-rose-700"
									: "border border-slate-200 bg-slate-50 text-slate-700"
								}`}
						>
							{message}
						</p>

						{status === "success" ? (
							<div className="mt-6 flex flex-col gap-3">
								<Link
									href={redirectPath}
									className="inline-block rounded-xl bg-[#d64045] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2"
								>
									{redirectPath === "/login" ? "Go to Sign In" : "Continue"}
								</Link>
								<p className="text-xs text-slate-500">
									Redirecting automatically in {countdown} second{countdown !== 1 ? 's' : ''}...
								</p>
							</div>
						) : null}

						{status === "error" ? (
							<div className="mt-6 flex flex-col gap-3">
								<p className="text-xs text-slate-500">
									If the link expired, request a new email from the onboarding screen.
								</p>
								<Link
									href="/onboarding"
									className="inline-block rounded-xl bg-[#d64045] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2"
								>
									Back to Onboarding
								</Link>
							</div>
						) : null}
					</div>
				</section>
			</div>
		</main>
	);
}
