import { Target, Users, Gamepad2 } from "lucide-react";
import VerificationWizard from "@/components/VerificationWizard";
import BrandLogo from "@/components/BrandLogo";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

export default function IdentityVerificationPage() {
	const userId = getDemoUserId();
	const campusId = getDemoCampusId();

	return (
		<main className="min-h-screen w-full bg-[#f8f9fa] flex items-stretch">
			{/* Left visual side - Pure white to match logo background */}
			<section className="hidden lg:flex lg:flex-[1.3] flex-col justify-center items-center bg-white relative overflow-hidden text-center">
				{/* Subtle accent at edges only - keeping logo area pure white */}
				<div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-to-tr from-rose-50/50 to-transparent" />
				<div className="absolute top-0 right-0 w-1/3 h-1/3 bg-gradient-to-bl from-slate-50/50 to-transparent" />

				<div className="relative z-10 flex flex-col items-center max-w-lg mx-auto">
					{/* Logo - no blending needed since bg is pure white */}
					<div className="mb-8">
						<BrandLogo
							withWordmark={false}
							asLink={false}
							backgroundTone="light"
							logoWidth={400}
							logoHeight={400}
							disableMixBlend={true}
							logoClassName="!h-[280px] w-auto"
							taglineClassName="hidden"
						/>
					</div>

					<div className="space-y-6">
						<h2 className="text-4xl font-extrabold tracking-tight text-slate-900">
							<span className="text-[#881337]">Connect.</span> <span className="text-slate-700">Play.</span> <span className="text-[#1b2a3a]">Belong.</span>
						</h2>
						<p className="text-lg text-slate-600 leading-relaxed font-medium">
							The ultimate campus companion for socializing, gaming, and discovering what&apos;s happening around you.
						</p>
					</div>

					<div className="mt-16 grid grid-cols-3 gap-6 w-full px-4">
						<div className="flex flex-col items-center gap-3 group">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-[#1b2a3a] shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
								<Target className="h-6 w-6" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider text-slate-500">Discover</span>
						</div>
						<div className="flex flex-col items-center gap-3 group">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-[#881337] shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
								<Users className="h-6 w-6" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider text-slate-500">Connect</span>
						</div>
						<div className="flex flex-col items-center gap-3 group">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 shadow-sm ring-1 ring-slate-100 transition-all group-hover:-translate-y-1 group-hover:shadow-md">
								<Gamepad2 className="h-6 w-6" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider text-slate-500">Compete</span>
						</div>
					</div>
				</div>
			</section>

			{/* Right form side */}
			<section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 bg-white shadow-2xl z-20">
				<div className="w-full max-w-[420px] space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
					<div className="lg:hidden flex justify-center mb-6">
						<div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
							<BrandLogo
								withWordmark={false}
								asLink={false}
								backgroundTone="light"
								logoWidth={450}
								logoHeight={450}
								disableMixBlend={true}
								logoClassName="!h-48 !w-48 object-contain"
								taglineClassName="hidden"
							/>
						</div>
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
