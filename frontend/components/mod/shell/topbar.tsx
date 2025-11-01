"use client";

import { useEffect, useMemo, useState } from "react";

import type { StaffProfile } from "@/lib/staff-auth-guard";

export type StaffTopbarProps = {
	profile: StaffProfile;
	activeCampus: string | null;
	campuses: string[];
	onCampusChange?: (campus: string | null) => void;
	onSearch?: (term: string) => void;
};

export function StaffTopbar({ profile, activeCampus, campuses, onCampusChange, onSearch }: StaffTopbarProps) {
	const [campus, setCampus] = useState<string | null>(activeCampus);
	const [term, setTerm] = useState("");

	useEffect(() => {
		setCampus(activeCampus ?? null);
	}, [activeCampus]);

	const campusOptions = useMemo(() => {
		if (!campuses.length) {
			return [];
		}
		return campuses;
	}, [campuses]);

	function handleCampusChange(next: string) {
		const nextCampus = next === "*" ? null : next;
		setCampus(nextCampus);
		onCampusChange?.(nextCampus);
	}

	function handleSearch(value: string) {
		setTerm(value);
		onSearch?.(value);
	}

	return (
		<header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4">
			<div className="flex items-center gap-3">
				<h1 className="text-base font-semibold text-slate-900">Moderator Console</h1>
				{campusOptions.length > 0 && (
					<select
						className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm"
						value={campus ?? "*"}
						onChange={(event) => handleCampusChange(event.target.value)}
						aria-label="Select campus scope"
					>
						<option value="*">All campuses</option>
						{campusOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				)}
			</div>
			<div className="flex items-center gap-4">
				<label className="relative hidden items-center md:flex">
					<span className="sr-only">Search cases</span>
					<input
						type="search"
						value={term}
						onChange={(event) => handleSearch(event.target.value)}
						placeholder="Search cases, users, macros"
						className="w-72 rounded-full border border-slate-200 bg-white px-4 py-1 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
					/>
				</label>
				<div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600 shadow-sm">
					<span className="font-medium">{profile.display_name ?? profile.email ?? 'Staff'}</span>
					{profile.scopes?.includes('staff.admin') ? (
						<span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">Admin</span>
					) : (
						<span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Moderator</span>
					)}
				</div>
			</div>
		</header>
	);
}
