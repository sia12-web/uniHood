"use client";

import type { PublicProfile } from "@/lib/types";

type PublicProfileHeaderProps = {
	profile: PublicProfile;
};

export default function PublicProfileHeader({ profile }: PublicProfileHeaderProps) {
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
					<h1 className="text-xl font-semibold text-slate-900">{profile.display_name}</h1>
					<p className="text-sm text-slate-500">@{profile.handle}</p>
					{profile.campus_id ? (
						<p className="text-sm text-slate-500">Campus: {profile.campus_id}</p>
					) : null}
				</div>
			</div>
			{profile.bio ? <p className="text-sm text-slate-600 md:flex-1">{profile.bio}</p> : null}
		</header>
	);
}
