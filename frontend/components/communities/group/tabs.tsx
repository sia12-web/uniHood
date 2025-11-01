"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
	{ href: (groupId: string) => `/communities/groups/${groupId}`, label: "Posts" },
	{ href: (groupId: string) => `/communities/groups/${groupId}/events`, label: "Events" },
	{ href: (groupId: string) => `/communities/groups/${groupId}/about`, label: "About" },
	{ href: (groupId: string) => `/communities/groups/${groupId}/members`, label: "Members" },
];

export function GroupTabs({ groupId }: { groupId: string }) {
	const pathname = usePathname();

	return (
		<nav className="flex items-center gap-2" aria-label="Group sections">
			{TABS.map((tab) => {
				const href = tab.href(groupId);
				const isActive = pathname === href || (tab.label === "Posts" && pathname === `${href}/`);
				return (
					<Link
						key={tab.label}
						href={href}
						className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${
							isActive ? "bg-midnight text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
						}`}
						aria-current={isActive ? "page" : undefined}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
