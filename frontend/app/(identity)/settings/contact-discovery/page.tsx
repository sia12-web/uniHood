import ContactDiscoveryOptIn from "@/components/ContactDiscoveryOptIn";
import { getDemoUserCampus, getDemoUserId } from "@/lib/env";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoUserCampus();

export default function ContactDiscoverySettingsPage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold text-slate-900">Contact discovery</h1>
				<p className="text-sm text-slate-600">
					Manage the opt-in flag, rotate salts, and simulate hashed uploads to test Phase 8 privacy-preserving discovery.
				</p>
			</header>
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-sm text-slate-600">
							The demo user (<span className="font-medium text-slate-900">{DEMO_USER_ID}</span>) issues headers for opt-in calls.
							Use the hashing helper to prepare {"{kind:digest}"} payloads for the upload and match endpoints.
						</p>
			</section>
			<ContactDiscoveryOptIn userId={DEMO_USER_ID} campusId={DEMO_CAMPUS_ID} />
		</main>
	);
}
