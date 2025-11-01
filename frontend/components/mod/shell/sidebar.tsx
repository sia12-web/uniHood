"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
	{ href: "/admin/mod/cases", label: "Cases" },
	{ href: "/admin/mod/quarantine", label: "Quarantine" },
	{ href: "/admin/mod/jobs", label: "Jobs" },
	{ href: "/admin/mod/tools/macro", label: "Tools" },
];

export function StaffSidebar() {
	const pathname = usePathname() || "/";

	return (
		<aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-slate-50/80 p-4 lg:flex">
			<nav className="flex w-full flex-col gap-1">
				<div className="px-2 pb-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Moderation</p>
				</div>
				{NAV_LINKS.map((link) => {
					const active = pathname.startsWith(link.href);
					return (
						<Link
							key={link.href}
							href={link.href}
							className={`rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-slate-200/80 hover:text-slate-900 ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'}`}
						>
							{link.label}
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}
