import LinkedAccounts from "@/components/LinkedAccounts";
import { getDemoUserCampus, getDemoUserId } from "@/lib/env";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoUserCampus();

export default function LinkedAccountsSettingsPage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-3xl font-semibold text-slate-900">Linked accounts</h1>
				<p className="text-sm text-slate-600">
					Exercise the new Phase 8 linking APIs: fetch providers, simulate OAuth callbacks, and remove stored identities.
				</p>
			</header>
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-sm text-slate-600">
					The demo user (<span className="font-medium text-slate-900">{DEMO_USER_ID}</span>) is injected via headers.
					Use the buttons below to trigger rate limits, linking conflicts, and unlink validations.
				</p>
			</section>
			<LinkedAccounts userId={DEMO_USER_ID} campusId={DEMO_CAMPUS_ID} />
		</main>
	);
}
