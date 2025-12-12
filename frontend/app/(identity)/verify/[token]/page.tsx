"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Target, Users, Gamepad2 } from "lucide-react";
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
		<main className="min-h-screen w-full bg-[#f8f9fa] flex items-stretch">
			{/* Left visual side */}
			<section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-gradient-to-br from-[#ffe4e6] via-[#fff1f2] to-[#ffe4e6] p-16 relative overflow-hidden text-center">
				{/* Decorative background elements */}
				<div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#fecdd3] to-transparent rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
				<div className="absolute bottom-0 left-0 w-full h-96 bg-gradient-to-t from-white to-transparent opacity-60" />

				<div className="relative z-10 flex flex-col items-center">
					<BrandLogo
						withWordmark={false}
						asLink={false}
						backgroundTone="transparent"
						logoWidth={256}
						logoHeight={256}
						className="text-[#881337] mb-12"
						logoClassName="!h-32 w-auto"
						wordmarkTitleClassName="text-7xl tracking-tight text-[#881337]"
						taglineClassName="hidden"
					/>
					<div className="max-w-md">
						<h2 className="text-2xl font-medium text-slate-800 leading-snug">
							Where your academic world <br />
							meets your social life.
						</h2>
					</div>

					<div className="mt-12 grid gap-8 text-left max-w-sm w-full">
						<div className="flex items-start gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
								<Target className="h-6 w-6" />
							</div>
							<div>
								<h3 className="font-bold text-slate-900 text-lg">Live Campus Radar</h3>
								<p className="text-sm text-slate-600 leading-relaxed">Instantly discover classmates, events, and activities happening nearby.</p>
							</div>
						</div>
						<div className="flex items-start gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
								<Users className="h-6 w-6" />
							</div>
							<div>
								<h3 className="font-bold text-slate-900 text-lg">Find Your Community</h3>
								<p className="text-sm text-slate-600 leading-relaxed">Connect with your crowd, join groups, and never miss a campus moment.</p>
							</div>
						</div>
						<div className="flex items-start gap-4">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e6] text-[#881337]">
								<Gamepad2 className="h-6 w-6" />
							</div>
							<div>
								<h3 className="font-bold text-slate-900 text-lg">Game Station</h3>
								<p className="text-sm text-slate-600 leading-relaxed">Play mini-games, climb leaderboards, and earn points with friends.</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Right form side */}
			<section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-white shadow-2xl z-20">
				<div className="w-full max-w-[420px] space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
					<div className="lg:hidden flex justify-center mb-2">
						<BrandLogo
							withWordmark={false}
							asLink={false}
							backgroundTone="transparent"
							logoWidth={64}
							logoHeight={64}
							className="text-[#881337]"
							logoClassName="h-16 w-auto"
							wordmarkTitleClassName="text-4xl tracking-tight text-[#881337]"
							taglineClassName="hidden"
						/>
					</div>

					<div className="text-center space-y-6">
						<h2 className="text-3xl font-bold text-slate-900 tracking-tight">Email Verification</h2>

						<div
							className={`rounded-2xl p-4 text-sm font-medium ${status === "success"
								? "border border-green-100 bg-green-50/50 text-green-700"
								: status === "error"
									? "border border-red-100 bg-red-50/50 text-red-700"
									: "border border-slate-100 bg-slate-50/50 text-slate-700"
								}`}
						>
							{message}
						</div>

						{status === "success" ? (
							<div className="flex flex-col gap-4 space-y-3">
								<Link
									href={redirectPath}
									className="w-full rounded-xl bg-[#c1272d] py-3.5 text-lg font-bold text-white shadow-lg shadow-rose-900/20 transition-all hover:bg-[#a01e23] hover:shadow-xl hover:shadow-rose-900/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-rose-100"
								>
									{redirectPath === "/login" ? "Go to Sign In" : "Continue"}
								</Link>
								<p className="text-xs text-slate-500">
									Redirecting automatically in {countdown} second{countdown !== 1 ? 's' : ''}...
								</p>
							</div>
						) : null}

						{status === "error" ? (
							<div className="flex flex-col gap-4 space-y-3">
								<p className="text-sm text-slate-500">
									If the link expired, request a new email from the onboarding screen.
								</p>
								<Link
									href="/onboarding"
									className="w-full rounded-xl bg-[#c1272d] py-3.5 text-lg font-bold text-white shadow-lg shadow-rose-900/20 transition-all hover:bg-[#a01e23] hover:shadow-xl hover:shadow-rose-900/30 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-rose-100"
								>
									Back to Onboarding
								</Link>
							</div>
						) : null}

						{status === "loading" && (
							<div className="flex justify-center">
								<svg className="animate-spin h-8 w-8 text-[#c1272d]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							</div>
						)}
					</div>
				</div>
			</section>
		</main>
	);
}
