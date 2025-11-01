"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import type { CurrentUser } from "@/lib/auth-guard";
import { api } from "@/lib/api";
import { useUnreadNotificationsCount } from "@/hooks/notifications/use-unread-count";

import ExploreQuick from "./explore-quick";
import EventsSoon from "./events-soon";
import { SidebarListSkeleton } from "./skeletons";

const SIDEBAR_BREAKPOINT = 1024;

type GroupSummary = {
	id: string;
	name: string;
	slug: string;
	avatar_key?: string | null;
};

type GroupListResponse = {
	items: GroupSummary[];
};

async function fetchMyGroups(): Promise<GroupSummary[]> {
	const response = await api.get<GroupListResponse>("/groups", { params: { member: "me", limit: 20 } });
	return response.data.items ?? [];
}

export function Sidebar({ me }: { me: CurrentUser }) {
	const pathname = usePathname();
	const [isMobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["communities", "my-groups", me.id],
		queryFn: fetchMyGroups,
		staleTime: 5 * 60 * 1000,
	});

	const groups = data ?? [];
	const unreadQuery = useUnreadNotificationsCount();
	const unreadCount = unreadQuery.data ?? 0;
	const unreadBadge = unreadCount > 99 ? "99+" : String(unreadCount);

	return (
		<>
			{isMobileOpen ? (
				<button
					type="button"
					className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 lg:hidden"
					onClick={() => setMobileOpen(false)}
					aria-expanded="true"
					aria-controls="communities-sidebar"
				>
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Menu</span>
				</button>
			) : (
				<button
					type="button"
					className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 lg:hidden"
					onClick={() => setMobileOpen(true)}
					aria-expanded="false"
					aria-controls="communities-sidebar"
				>
					<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Menu</span>
				</button>
			)}
			<aside
				id="communities-sidebar"
				className={`${isMobileOpen ? "flex" : "hidden"} w-full max-w-[20rem] shrink-0 lg:flex lg:w-80`}
				data-breakpoint={SIDEBAR_BREAKPOINT}
				aria-label="Communities navigation"
			>
				<div className="flex h-full w-80 flex-col gap-6 border-r border-slate-200 bg-white p-4 shadow-sm">
					<section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-1">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
								<h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
								<p className="text-xs text-slate-500">Stay current with comments, reactions, and new posts.</p>
							</div>
							{unreadCount > 0 ? (
								<span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
									{unreadBadge}
								</span>
							) : null}
						</div>
						<div className="mt-3 flex items-center justify-between gap-2">
							<Link
								href="/communities/notifications"
								className="inline-flex items-center gap-2 rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
							>
								Open inbox
							</Link>
							{unreadQuery.isFetching ? (
								<span className="text-xs text-slate-400">Refreshing…</span>
							) : null}
						</div>
					</section>
					<section aria-labelledby="sidebar-my-groups" className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<h2 id="sidebar-my-groups" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								My Groups
							</h2>
							<Link href="/communities/groups" className="text-xs font-semibold text-midnight underline-offset-2 hover:underline">
								View all
							</Link>
						</div>
						{isLoading ? (
							<SidebarListSkeleton rows={4} />
						) : isError ? (
							<button
								type="button"
								onClick={() => refetch()}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
							>
								Retry loading groups
							</button>
						) : groups.length === 0 ? (
							<p className="text-sm text-slate-600">Join a group to see it listed here.</p>
						) : (
							<ul className="flex flex-col gap-1" role="list">
								{groups.map((group: GroupSummary) => {
									const active = pathname?.startsWith(`/communities/groups/${group.id}`) ?? false;
									return (
										<li key={group.id}>
											<Link
												href={`/communities/groups/${group.id}`}
												className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
												aria-current={active ? "page" : undefined}
											>
												<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
													{group.name.charAt(0).toUpperCase()}
												</span>
												<span className="truncate">{group.name}</span>
											</Link>
										</li>
									);
								})}
							</ul>
						)}
					</section>

					<section aria-labelledby="sidebar-explore" className="flex flex-col gap-3">
						<h2 id="sidebar-explore" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
							Explore
						</h2>
						<ExploreQuick />
					</section>

					<section aria-labelledby="sidebar-events" className="flex flex-col gap-3">
						<h2 id="sidebar-events" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
							Events
						</h2>
						<EventsSoon />
					</section>
				</div>
			</aside>
		</>
	);
}
