"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { verifyEmailToken } from "@/lib/identity";

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

	useEffect(() => {
		let cancelled = false;
		async function run() {
			setStatus("loading");
			setMessage("Verifying your email…");
			try {
				await verifyEmailToken(token);
				if (!cancelled) {
					setStatus("success");
					setMessage("Email verified! Redirecting to sign in...");
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
						router.push("/login");
						return 0;
					}
					return prev - 1;
				});
			}, 1000);

			return () => clearInterval(countdownInterval);
		}
	}, [status, router]);

	return (
		<main className="min-h-screen w-full bg-white">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
				<section className="flex flex-[1.2] flex-col items-center justify-center text-slate-900 lg:items-start lg:-ml-16">
					<div className="relative flex flex-col">
						<BrandLogo
							backgroundTone="transparent"
							logoWidth={1600}
							logoHeight={1600}
							className="w-full max-w-5xl justify-center text-[#b7222d] lg:justify-start"
							logoClassName="h-screen w-auto sm:h-screen lg:h-screen lg:max-h-[700px]"
						/>
					</div>
				</section>

				<section className="flex flex-1">
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
									href="/login"
									className="inline-block rounded-xl bg-[#d64045] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2"
								>
									Go to Sign In
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
