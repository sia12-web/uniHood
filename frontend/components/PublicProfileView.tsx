"use client";

import Link from "next/link";

import type { PublicProfile } from "@/lib/types";
import { XPOverviewCard } from "@/components/xp/XPOverviewCard";

import PublicProfileHeader from "./PublicProfileHeader";

type PublicProfileViewProps = {
	profile: PublicProfile;
};

export default function PublicProfileView({ profile }: PublicProfileViewProps) {
	return (
		<section className="space-y-6">
			<PublicProfileHeader profile={profile} />

			<XPOverviewCard
				xp={profile.xp}
				level={profile.level}
				nextLevelXp={profile.next_level_xp}
			/>

			{profile.program && profile.program.toLowerCase() !== 'none' || profile.year ? (
				<section className="rounded border border-slate-200 bg-white px-4 py-4">
					<h2 className="text-base font-semibold text-slate-900">Program</h2>
					<p className="text-sm text-slate-600">
						{profile.program && profile.program.toLowerCase() !== 'none' ? profile.program : "Program hidden"}
						{profile.year ? ` · Class of ${profile.year}` : ""}
					</p>
				</section>
			) : null}
			{profile.interests.length > 0 ? (
				<section className="rounded border border-slate-200 bg-white px-4 py-4">
					<h2 className="text-base font-semibold text-slate-900">Interests</h2>
					<ul className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
						{profile.interests.map((interest) => (
							<li key={interest} className="rounded-full bg-slate-100 px-3 py-1">
								{interest}
							</li>
						))}
					</ul>
				</section>
			) : null}
			{profile.skills.length > 0 ? (
				<section className="rounded border border-slate-200 bg-white px-4 py-4">
					<h2 className="text-base font-semibold text-slate-900">Skills</h2>
					<ul className="mt-2 space-y-2 text-sm text-slate-600">
						{profile.skills.map((skill) => (
							<li key={skill.display} className="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
								<span>{skill.display}</span>
								<span className="text-xs text-slate-500">Level {skill.proficiency}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{profile.links.length > 0 ? (
				<section className="rounded border border-slate-200 bg-white px-4 py-4">
					<h2 className="text-base font-semibold text-slate-900">Links</h2>
					<ul className="mt-2 space-y-2 text-sm text-slate-600">
						{profile.links.map((link) => (
							<li key={`${link.kind}-${link.url}`}>
								<Link href={link.url} className="text-slate-600 underline" target="_blank" rel="noopener noreferrer">
									{link.kind}
								</Link>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</section>
	);
}
