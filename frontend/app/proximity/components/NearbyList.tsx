"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDistance } from "@/lib/geo";
import type { NearbyUser } from "@/lib/types";

interface NearbyListProps {
	users: NearbyUser[];
	loading: boolean;
	error?: string | null;
	onInvite?: (userId: string) => void;
	onChat?: (userId: string) => void;
	invitePendingId?: string | null;
	onSelect?: (user: NearbyUser) => void;
	selectedUserId?: string | null;
	selectedTemplate?: string | null;
}

const relationshipBadge = (user: NearbyUser) => {
	if (user.is_friend) {
		return { label: "Friend", tone: "text-emerald-600", icon: "🤝" };
	}
	if (user.invite_status === "pending") {
		return { label: "Invite pending", tone: "text-amber-600", icon: "⏳" };
	}
	if (user.is_new) {
		return { label: "New arrival", tone: "text-sky-600", icon: "✨" };
	}
	return null;
};

export function NearbyList({
	users,
	loading,
	error,
	onInvite,
	onChat,
	invitePendingId,
	onSelect,
	selectedUserId,
	selectedTemplate: _selectedTemplate,
}: NearbyListProps) {
	const router = useRouter();

	if (error) {
		return <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>;
	}
		void _selectedTemplate;

	if (loading) {
		return <p className="text-sm text-slate-500">Looking for nearby friends…</p>;
	}

	if (users.length === 0) {
		return <p className="text-sm text-slate-500">Nobody is nearby yet.</p>;
	}

	return (
		<ul className="space-y-3">
			{users.map((user) => {
				const username = user.display_name || user.handle || "Divan member";
				const badge = relationshipBadge(user);
				const selected = selectedUserId === user.user_id;
				return (
					<li
						key={user.user_id}
						className={`group rounded-2xl border border-slate-200 bg-white/80 shadow-sm transition hover:border-slate-300 ${selected ? "ring-2 ring-emerald-400" : ""}`}
					>
						<div className="flex flex-col gap-3 p-4">
							<div
								role="button"
								tabIndex={0}
								onClick={() => onSelect?.(user)}
								onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onSelect?.(user);
									}
								}}
								className="flex cursor-pointer flex-col gap-3"
							>
								<div className="flex items-center gap-3">
									<div className="relative">
										<span className="absolute -inset-1 rounded-full bg-emerald-200/40 blur group-hover:animate-ping" aria-hidden />
										{user.avatar_url ? (
											<Image
												src={user.avatar_url}
												alt={username}
												width={48}
												height={48}
												className="h-12 w-12 rounded-full object-cover shadow"
											/>
										) : (
											<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
												{username.slice(0, 1).toUpperCase()}
											</div>
										)}
										<span className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[0.6rem] text-white shadow">
											●
										</span>
									</div>
									<div className="flex flex-1 flex-col gap-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="text-base font-semibold text-slate-900 underline-offset-2 group-hover:underline">
												{username}
											</span>
											{badge ? (
												<span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-semibold ${badge.tone}`}>
													<span aria-hidden>{badge.icon}</span>
													{badge.label}
												</span>
											) : null}
										</div>
										<div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
											<span>{formatDistance(user.distance_m ?? null)}</span>
											{user.major ? <span>• {user.major}</span> : null}
											{user.last_activity ? <span>• {user.last_activity}</span> : null}
											{user.trust_score != null ? <span>• {user.trust_score}% trust</span> : null}
										</div>
									</div>
								</div>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-3">
								{user.is_friend ? (
									<button
										type="button"
										onClick={(event: MouseEvent<HTMLButtonElement>) => {
											event.stopPropagation();
											if (onChat) {
												onChat(user.user_id);
												return;
											}
											router.push(`/chat/${user.user_id}`);
										}}
										className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-500"
									>
										Chat
										<span aria-hidden>💬</span>
									</button>
								) : null}
								{onInvite && !user.is_friend ? (
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											onInvite(user.user_id);
										}}
										className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-500 disabled:opacity-60"
										disabled={invitePendingId === user.user_id}
									>
										{invitePendingId === user.user_id ? "Sending…" : "Invite"}
										<span aria-hidden>➜</span>
									</button>
								) : null}
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
