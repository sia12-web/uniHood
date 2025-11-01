import PasskeyManager from "@/components/PasskeyManager";
import { getDemoUserCampus, getDemoUserEmail, getDemoUserId } from "@/lib/env";

const DEMO_USER_ID = getDemoUserId();
const DEMO_USER_EMAIL = getDemoUserEmail();
const DEMO_USER_CAMPUS = getDemoUserCampus();

export default function PasskeysSettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Passkeys &amp; trusted devices</h1>
        <p className="text-sm text-slate-600">
          Register FIDO2 authenticators, manage trusted browsers, and exercise the Phase 8 security and step-up APIs.
        </p>
      </header>
      <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Demo account: <span className="font-medium text-slate-900">{DEMO_USER_EMAIL}</span>
          {DEMO_USER_CAMPUS ? (
            <span className="ml-2 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Campus {DEMO_USER_CAMPUS}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-slate-600">
          Use the sign-in demo inside the manager to mint re-auth tokens automatically before removing passkeys or trusted devices.
        </p>
      </section>
      <PasskeyManager userId={DEMO_USER_ID} loginHint={DEMO_USER_EMAIL} />
    </main>
  );
}
