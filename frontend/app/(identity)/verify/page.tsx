import VerificationWizard from "@/components/VerificationWizard";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

export default function IdentityVerificationPage() {
	const userId = getDemoUserId();
	const campusId = getDemoCampusId();

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold text-slate-900">Identity verification</h1>
				<p className="text-sm text-slate-600">
					Connect your campus SSO or upload a student ID to unlock trust badges and higher feature limits.
				</p>
			</header>
			<VerificationWizard userId={userId} campusId={campusId} />
		</main>
	);
}
