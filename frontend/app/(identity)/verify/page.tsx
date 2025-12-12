import { Target, Users, Gamepad2 } from "lucide-react";
import VerificationWizard from "@/components/VerificationWizard";
import BrandLogo from "@/components/BrandLogo";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

export default function IdentityVerificationPage() {
	const userId = getDemoUserId();
	const campusId = getDemoCampusId();

	return (
		<main className="min-h-screen w-full bg-[#f8f9fa] flex items-stretch">
			{/* Left visual side */}
			<section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-gradient-to-br from-[#ffe4e6] via-[#fff1f2] to-[#ffe4e6] p-16 relative overflow-hidden text-center">
				{/* Decorative background elements */}
				<div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#fecdd3] to-transparent rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2" />
				<div className="absolute bottom-0 left-0 w-full h-96 bg-gradient-to-t from-white to-transparent opacity-60" />

				<div className="relative z-10 flex flex-col items-center">
					<BrandLogo
						withWordmark={true}
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
							withWordmark={true}
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
					<div className="text-center lg:text-left space-y-2">
						<h2 className="text-3xl font-bold text-slate-900 tracking-tight">Identity Verification</h2>
						<p className="text-slate-500">
							Connect your campus SSO or upload a student ID to unlock trust badges and higher feature limits.
						</p>
					</div>

					<VerificationWizard userId={userId} campusId={campusId} />
				</div>
			</section>
		</main>
	);
}
