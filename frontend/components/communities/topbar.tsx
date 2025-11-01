"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { CurrentUser } from "@/lib/auth-guard";
import { api } from "@/lib/api";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

type TypeaheadHit = { id: string; name: string; slug: string; kind: string };

type TypeaheadResponse = {
	hits: TypeaheadHit[];
};

function useDebouncedValue<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

export function Topbar({ me }: { me: CurrentUser }) {
	const pathname = usePathname();
	const [search, setSearch] = useState("");
	const debounced = useDebouncedValue(search, 200);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const { data } = useQuery({
		queryKey: ["communities", "typeahead", debounced],
		queryFn: async () => {
			const response = await api.get<TypeaheadResponse>("/search/typeahead", {
				params: { q: debounced, scope: "groups" },
			});
			return response.data;
		},
		enabled: debounced.length >= 2,
		staleTime: 30_000,
	});

	const hits = data?.hits ?? [];
	const hasMatches = hits.length > 0;

	useEffect(() => {
		if (!inputRef.current) {
			return;
		}
		inputRef.current.setAttribute("aria-expanded", hasMatches ? "true" : "false");
	}, [hasMatches]);

	return (
		<header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
				<nav aria-label="Communities breadcrumb" className="hidden text-sm font-medium text-slate-600 md:flex">
					<ol className="flex items-center gap-2">
						<li>
							<Link href="/communities" className="rounded px-2 py-1 transition hover:bg-slate-100">
								Communities
							</Link>
						</li>
						<li aria-hidden>/</li>
						<li>
							<span className="rounded px-2 py-1 text-slate-800" aria-current="page">
								{pathname?.replace("/communities", "").replaceAll("/", " ") || "Home"}
							</span>
						</li>
					</ol>
				</nav>
				<div className="relative flex-1">
					<label htmlFor="communities-search" className="sr-only">
						Search communities
					</label>
					<input
						id="communities-search"
						type="search"
						ref={inputRef}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						role="combobox"
						aria-expanded="false"
						aria-autocomplete="list"
						aria-controls="communities-typeahead"
						placeholder="Search groups"
						className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm shadow-inner focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/40"
					/>
					{hasMatches ? (
						<ul
							id="communities-typeahead"
							role="listbox"
							className="absolute left-0 right-0 top-full z-10 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
						>
							{hits.map((hit: TypeaheadHit) => (
								<li key={hit.id} role="option" aria-selected="false">
									<Link
										href={`/communities/groups/${hit.slug}`}
										className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
									>
										<span>{hit.name}</span>
										<span className="text-xs uppercase text-slate-400">{hit.kind}</span>
									</Link>
								</li>
							))}
						</ul>
					) : null}
				</div>
				<div className="flex items-center gap-3">
					<NotificationsBell />
					<span className="text-sm text-slate-600" aria-label="Signed in user">
						{me.display_name ?? me.handle ?? "Account"}
					</span>
					<Link
						href="/profiles/me"
						className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-midnight text-sm font-semibold text-white shadow-sm transition hover:bg-navy"
						aria-label="Open profile settings"
					>
						{me.display_name?.charAt(0)?.toUpperCase() ?? "U"}
					</Link>
				</div>
			</div>
		</header>
	);
}
