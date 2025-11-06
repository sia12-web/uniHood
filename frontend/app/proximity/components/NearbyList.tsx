
"use client";

import Image from "next/image";
import { formatDistance } from "@/lib/geo";
import type { NearbyUser } from "@/lib/types";

interface NearbyListProps {
	users: NearbyUser[];
	loading: boolean;
	error?: string | null;
	onInvite?: (userId: string) => void;
	invitePendingId?: string | null;
}

export function NearbyList({ users, loading, error, onInvite, invitePendingId }: NearbyListProps) {
	if (error) {
		return <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>;
	}

	if (loading) {
		return <p className="text-sm text-slate-500">Looking for nearby friends…</p>;
	}

	if (users.length === 0) {
		return <p className="text-sm text-slate-500">Nobody is nearby yet.</p>;
	}

	return (
		<ul className="space-y-2">
			{users.map((user) => {
				const username = user.display_name || user.handle;
				return (
					<li
						key={user.user_id}
						className="flex items-center justify-between rounded border border-slate-200 bg-white px-4 py-3 shadow-sm"
					>
						<div className="flex items-center gap-3">
							{user.avatar_url ? (
								<Image
									src={user.avatar_url}
									alt={username}
									width={40}
									height={40}
									className="h-10 w-10 rounded-full object-cover"
								/>
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm text-slate-600">
									{(username || "?").slice(0, 1).toUpperCase()}
								</div>
							)}
							<div>
								<p className="font-medium text-slate-900">{username}</p>
								{user.major ? (
									<p className="text-xs text-slate-600">{user.major}</p>
								) : null}
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="text-right text-sm text-slate-600">
								<p>{formatDistance(user.distance_m ?? null)}</p>
								{user.is_friend ? <span className="text-emerald-600">Friend</span> : null}
							</div>
							{onInvite && !user.is_friend ? (
								<button
									type="button"
									className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white shadow disabled:opacity-60"
									onClick={() => onInvite(user.user_id)}
									disabled={invitePendingId === user.user_id}
								>
									{invitePendingId === user.user_id ? "Sending…" : "Invite"}
								</button>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
