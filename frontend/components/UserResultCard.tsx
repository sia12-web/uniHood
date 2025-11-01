import Image from "next/image";
import React from "react";

import type { SearchUserResult } from "@/lib/types";

type UserResultCardProps = {
	user: SearchUserResult;
	actionLabel?: string;
	onAction?(userId: string): void;
};

export default function UserResultCard({ user, actionLabel = "Invite", onAction }: UserResultCardProps) {
	const initials = user.display_name.trim()[0]?.toUpperCase() ?? user.handle[0]?.toUpperCase() ?? "?";
	const scoreText = user.score.toFixed(2);
	return (
		<div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
			<div className="flex items-center gap-3">
				<div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
					{user.avatar_url ? (
						<Image src={user.avatar_url} alt={user.display_name} fill className="object-cover" sizes="40px" />
					) : (
						<span>{initials}</span>
					)}
				</div>
				<div className="space-y-1 text-sm">
					<p className="font-semibold text-slate-900">{user.display_name}</p>
					<p className="text-xs text-slate-500">@{user.handle}</p>
					<p className="text-xs text-slate-500">
						Mutual friends: {user.mutual_count} • Score {scoreText}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-2 text-sm">
				{user.is_friend ? (
					<span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">Friends</span>
				) : onAction ? (
					<button
						type="button"
						onClick={() => onAction(user.user_id)}
						className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-800"
					>
						{actionLabel}
					</button>
				) : null}
			</div>
		</div>
	);
}
