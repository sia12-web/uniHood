import Link from "next/link";

const ADMIN_FEATURES = [
  {
    title: "Policy & consent",
    href: "/consent",
    description:
      "Review published policies, see which students still need to accept, and export acceptance logs if needed.",
  },
  {
    title: "Feature flags",
    href: "/flags",
    description:
      "Flip rollout switches, manage campus-level overrides, and preview flag evaluation results.",
  },
  {
    title: "Roles & permissions",
    href: "/rbac",
    description:
      "Assign campus operators to granular roles that govern moderation, verification, and messaging powers.",
  },
  {
    title: "Verification review queue",
    href: "/verification",
    description:
      "Approve or reject identity submissions, inspect evidence, and track audit trails for trust decisions.",
  },
];

export default function AdminOverviewPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Part 2 · Operations</p>
        <h1 className="text-3xl font-bold text-slate-900">Keep the Divan network safe and compliant</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          These screens bundle the administrative workflows for campus operators. They rely on the same FastAPI backend
          but are segmented from the student experience so new features can roll out safely.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {ADMIN_FEATURES.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="text-lg font-semibold text-slate-900">{feature.title}</h2>
            <p className="text-sm text-slate-600">{feature.description}</p>
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Open console →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
