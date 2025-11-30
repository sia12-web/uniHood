"use client";

import Image from "next/image";

type CampusLogoBadgeProps = {
	campusId?: string | null;
	campusName?: string | null;
	className?: string;
};

const MCGILL_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2";

const isMcGillCampus = (campusId?: string | null, campusName?: string | null): boolean => {
	if (typeof campusId === "string" && campusId.toLowerCase() === MCGILL_ID) {
		return true;
	}
	if (typeof campusName === "string" && campusName.toLowerCase().includes("mcgill")) {
		return true;
	}
	return false;
};

export default function CampusLogoBadge({ campusId, campusName, className }: CampusLogoBadgeProps) {
	if (!isMcGillCampus(campusId, campusName)) {
		return null;
	}

	return (
		<div
			className={`flex items-center gap-2 rounded-xl border border-rose-100 bg-[#b7222d] px-2 py-1 text-white shadow-sm ${className ?? ""}`}
			aria-label="McGill University"
		>
			<div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base font-black text-[#b7222d]">
				<Image src="/brand/mcgill.svg" alt="McGill crest" width={32} height={32} className="h-8 w-8" priority />
			</div>
			<div className="flex min-w-0 flex-col leading-tight">
				<span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">University</span>
				<span className="truncate text-sm font-bold">McGill</span>
			</div>
		</div>
	);
}

export { isMcGillCampus, MCGILL_ID };
