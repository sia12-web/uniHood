import VerificationWizard from "@/components/VerificationWizard";
import BrandLogo from "@/components/BrandLogo";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

export default function IdentityVerificationPage() {
	const userId = getDemoUserId();
	const campusId = getDemoCampusId();

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
					<div className="w-full rounded-3xl bg-white px-6 py-8 shadow-2xl ring-1 ring-[#f0d8d9]/80 sm:px-9">
						<header className="flex flex-col gap-2 mb-6">
							<h1 className="text-2xl font-semibold text-slate-900">Identity verification</h1>
							<p className="text-sm text-slate-600">
								Connect your campus SSO or upload a student ID to unlock trust badges and higher feature limits.
							</p>
						</header>
						<VerificationWizard userId={userId} campusId={campusId} />
					</div>
				</section>
			</div>
		</main>
	);
}
