"use client";

import Image from "next/image";

type CampusLogoBadgeProps = {
	campusId?: string | null;
	campusName?: string | null;
	className?: string;
};

export default function CampusLogoBadge({ campusName, className, logoUrl }: CampusLogoBadgeProps & { logoUrl?: string | null }) {
	const name = campusName || "University";
	// Fallback initials if no logo
	const initial = name.charAt(0).toUpperCase();

	return (
		<div
			className={`flex items-center gap-2 rounded-xl border border-rose-100 bg-[#b7222d] px-2 py-1 text-white shadow-sm ${className ?? ""}`}
			aria-label={name}
		>
			<div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-base font-black text-white">
				{logoUrl ? (
					<Image src={logoUrl} alt={`${name} logo`} width={32} height={32} className="h-8 w-8 object-contain" priority />
				) : (
					<span>{initial}</span>
				)}
			</div>
			<div className="flex min-w-0 flex-col leading-tight">
				<span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">University</span>
				<span className="truncate text-sm font-bold">{name}</span>
			</div>
		</div>
	);
}

