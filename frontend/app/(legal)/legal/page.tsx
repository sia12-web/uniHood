import Link from "next/link";

export default function LegalHubPage() {
	return (
		<div className="space-y-8">
			<header className="space-y-2">
				<p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Legal</p>
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">Legal hub</h1>
				<p className="text-sm text-gray-600 dark:text-gray-400">
					These pages are the canonical versions served by the app—no placeholders, just the policies used by the backend.
				</p>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<LegalCard title="Privacy Policy" href="/privacy" description="How we collect, store, and share data across Divan services." />
				<LegalCard title="Terms of Service" href="/terms" description="Rules for using Divan and participating in campus communities." />
				<LegalCard title="Cookie Policy" href="/cookies" description="How cookies are used for sessions, analytics, and preferences." />
			</div>
		</div>
	);
}

function LegalCard({ title, description, href }: { title: string; description: string; href: string }) {
	return (
		<Link
			href={href}
			className="group block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
		>
			<h2 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-coral">{title}</h2>
			<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
		</Link>
	);
}
