"use client";

import { useEffect, useState } from "react";

import { ReportUI } from "@/app/features/moderation/ReportButton";
import type { PublicProfile } from "@/lib/types";

import { LevelBadge } from "@/components/xp/LevelBadge";

type PublicProfileHeaderProps = {
	profile: PublicProfile;
};

export default function PublicProfileHeader({ profile }: PublicProfileHeaderProps) {
	const [campusName, setCampusName] = useState<string | null>(null);

	useEffect(() => {
		if (!profile.campus_id) return;
		// Fetch campus name from API instead of showing raw UUID
		import("@/lib/identity").then(({ getCampusById }) => {
			getCampusById(profile.campus_id!)
				.then((data) => {
					if (data?.name) setCampusName(data.name);
				})
				.catch(() => { });
		});
	}, [profile.campus_id]);

	return (
		<header className="flex flex-col gap-4 rounded border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center">
			<div className="flex items-center gap-4">
				{profile.avatar_url ? (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img
						src={profile.avatar_url}
						alt={`${profile.display_name}'s avatar`}
						className="h-20 w-20 rounded-full object-cover"
					/>
				) : (
					<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-600">
						{profile.display_name.slice(0, 1).toUpperCase()}
					</div>
				)}
				<div>
					<h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
						{profile.display_name}
						{profile.level ? <LevelBadge level={profile.level} size="sm" /> : null}
					</h1>
					<p className="text-sm text-slate-500">@{profile.handle}</p>
					{campusName ? (
						<p className="text-sm text-slate-500">{campusName}</p>
					) : null}
				</div>
			</div>
			<div className="flex items-start justify-end gap-2 md:ml-auto">
				{/* Use handle for reporting instead of exposing internal user_id */}
				<ReportUI kind="profile" targetId={profile.handle} />
			</div>
			{profile.bio ? <p className="text-sm text-slate-600 md:flex-1">{profile.bio}</p> : null}
		</header>
	);
}
