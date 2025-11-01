"use client";

import Link from "next/link";

export default function ExploreQuick() {
	return (
		<div className="flex flex-col gap-2 text-sm text-slate-600">
			<p>
				Looking for something specific? Jump into the new search experience to find groups, posts, and
				events instantly or keep browsing curated highlights below.
			</p>
			<ul className="flex flex-col gap-1" aria-label="Explore communities">
				{[
					{ href: "/communities/search", label: "Search communities" },
					{ href: "/communities/groups", label: "View all groups" },
				].map((item) => (
					<li key={item.href}>
						<Link className="rounded-lg px-2 py-1 text-sm font-medium text-midnight transition hover:bg-slate-100" href={item.href}>
							{item.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
