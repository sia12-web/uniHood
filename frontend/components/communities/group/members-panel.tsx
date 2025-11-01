"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";

import { EmptyState } from "@/components/communities/empty-state";
import { useGroupMembers } from "@/hooks/communities/use-members";
import { usePresence } from "@/hooks/presence/use-presence";
import type { PresenceStatus } from "@/store/presence";

import { useGroupContext } from "./context";

function presenceLabel(status: PresenceStatus | null | undefined): { text: string; indicator: string; tone: string } {
	if (!status) {
		return { text: "Offline", indicator: "bg-slate-300", tone: "text-slate-400" };
	}
	if (status.online) {
		return { text: "Online now", indicator: "bg-emerald-500", tone: "text-emerald-600" };
	}
	if (status.lastSeen) {
		const parsed = new Date(status.lastSeen);
		if (!Number.isNaN(parsed.getTime())) {
			return {
				text: `Last active ${formatDistanceToNow(parsed, { addSuffix: true })}`,
				indicator: "bg-slate-300",
				tone: "text-slate-400",
			};
		}
	}
	return { text: "Offline", indicator: "bg-slate-300", tone: "text-slate-400" };
}

export function GroupMembersPanel() {
	const group = useGroupContext();
	const { members, isLoading, isError, error, refetch } = useGroupMembers(group.id);
	const memberIds = useMemo(() => members.map((member) => member.id).filter(Boolean), [members]);
	const { presence } = usePresence(memberIds);
	const onlineCount = useMemo(
		() => members.filter((member) => presence[member.id]?.online).length,
		[members, presence],
	);

	if (isLoading) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-sm text-slate-600">Loading roster…</p>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
				<p className="font-semibold">We could not load the member roster.</p>
				<p className="text-red-600">{error instanceof Error ? error.message : "Try again in a moment."}</p>
				<button
					type="button"
					onClick={() => refetch()}
					className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
				>
					Retry
				</button>
			</div>
		);
	}

	if (members.length === 0) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<EmptyState
					title="No members yet"
					description="Invite classmates to join this group and you will see their presence details here."
				/>
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Members</h2>
					<p className="text-sm text-slate-600">Presence updates refresh automatically.</p>
				</div>
				<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
					<span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
					{onlineCount} online
				</span>
			</header>
			<ul className="flex flex-col gap-3" role="list">
				{members.map((member) => {
					const status = presenceLabel(presence[member.id]);
					return (
						<li
							key={member.id}
							className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
						>
							<div className="flex items-center gap-3">
								<span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
									{member.avatar_url ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={member.avatar_url} alt={member.display_name ?? member.handle ?? "Group member"} className="h-full w-full object-cover" />
									) : (
										(member.display_name ?? member.handle ?? "M").charAt(0).toUpperCase()
									)}
									<span
										className={clsx(
											"absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
											status.indicator,
										)}
										aria-hidden
									/>
								</span>
								<div className="flex flex-col">
									<span className="font-semibold text-slate-900">{member.display_name ?? member.handle ?? "Member"}</span>
									{member.handle ? <span className="text-xs text-slate-500">@{member.handle}</span> : null}
									{member.role ? <span className="text-xs text-slate-400">{member.role}</span> : null}
								</div>
							</div>
							<span className={clsx("text-xs", status.tone)}>{status.text}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
