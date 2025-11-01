"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { ReputationBand } from "@/hooks/mod/user/use-reputation";

export type ReputationHeaderProps = {
	userId: string;
	displayName?: string | null;
	avatarUrl?: string | null;
	campus?: string | null;
	verified?: boolean | null;
	joinedAt?: string | null;
	riskBand: ReputationBand;
	extraActions?: ReactNode;
};

const BAND_STYLES: Record<ReputationBand, string> = {
	good: "bg-emerald-100 text-emerald-700 border border-emerald-200",
	neutral: "bg-slate-100 text-slate-700 border border-slate-200",
	watch: "bg-amber-100 text-amber-700 border border-amber-200",
	risk: "bg-orange-100 text-orange-700 border border-orange-200",
	bad: "bg-rose-100 text-rose-700 border border-rose-200",
};

export function ReputationHeader({
	userId,
	displayName,
	avatarUrl,
	campus,
	verified,
	joinedAt,
	riskBand,
	extraActions,
}: ReputationHeaderProps) {
	return (
		<header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
			<div className="flex items-center gap-4">
				{avatarUrl ? (
					<Image
						src={avatarUrl}
						alt={displayName ?? userId}
						width={56}
						height={56}
						className="h-14 w-14 rounded-full border border-slate-200 object-cover"
					/>
				) : (
					<div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-100 text-lg font-semibold uppercase text-slate-600">
						{(displayName ?? userId).slice(0, 2)}
					</div>
				)}
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-xl font-semibold text-slate-900">{displayName ?? userId}</h2>
						<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_STYLES[riskBand]}`}>{riskBand.toUpperCase()}</span>
						{verified ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Verified</span> : null}
					</div>
					<p className="text-sm text-slate-500">User ID: {userId}</p>
					<div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
						{campus ? <span>Campus: {campus}</span> : null}
						{joinedAt ? <span>Joined {new Date(joinedAt).toLocaleDateString()}</span> : null}
					</div>
				</div>
			</div>
			{extraActions ? <div className="flex flex-wrap items-center gap-3">{extraActions}</div> : null}
		</header>
	);
}
