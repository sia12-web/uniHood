"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

function buildCrumbs(pathname: string): { href: string; label: string }[] {
	const segments = pathname.split("/").filter(Boolean);
	const crumbs: { href: string; label: string }[] = [];
	segments.reduce<string>((accumulator, segment) => {
		const href = `${accumulator}/${segment}`;
		crumbs.push({ href, label: segment.replace(/[-_]/g, " ") });
		return href;
	}, "");
	return crumbs;
}

export function StaffBreadcrumb() {
	const pathname = usePathname() || "/";
	const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);

	if (crumbs.length <= 2) {
		// Hide redundant breadcrumbs when we are on the lounge root.
		return null;
	}

	return (
		<nav aria-label="Breadcrumb" className="px-4 py-2 text-xs text-slate-500">
			<ol className="flex items-center gap-2">
				{crumbs.map((crumb, index) => {
					const isLast = index === crumbs.length - 1;
					return (
						<li key={crumb.href} className="flex items-center gap-2">
							{index > 0 && <span aria-hidden="true">/</span>}
							{isLast ? (
								<span className="font-medium text-slate-700">{crumb.label}</span>
							) : (
								<Link href={crumb.href} className="transition hover:text-slate-700">
									{crumb.label}
								</Link>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
