"use client";

import { useMemo } from "react";
import type { NearbyUser } from "@/lib/types";

const POSITION_CLASSES = [
	"left-[18%] top-[22%]",
	"left-[35%] top-[18%]",
	"left-[62%] top-[20%]",
	"left-[80%] top-[32%]",
	"left-[25%] top-[40%]",
	"left-[50%] top-[36%]",
	"left-[70%] top-[45%]",
	"left-[15%] top-[58%]",
	"left-[34%] top-[62%]",
	"left-[52%] top-[58%]",
	"left-[75%] top-[64%]",
	"left-[28%] top-[78%]",
	"left-[48%] top-[74%]",
	"left-[68%] top-[78%]",
	"left-[40%] top-[50%]",
	"left-[58%] top-[50%]",
];

function positionClassFor(id: string, radius: number) {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash << 5) - hash + id.charCodeAt(index);
		hash |= 0;
	}
	const base = Math.abs(hash);
	const offsetIndex = base % POSITION_CLASSES.length;
	const spread = radius >= 200 ? 3 : radius >= 100 ? 2 : radius >= 50 ? 1 : 0;
	const index = (offsetIndex + spread) % POSITION_CLASSES.length;
	return POSITION_CLASSES[index];
}

type MiniMapProps = {
	users: NearbyUser[];
	radius: number;
	selectedUserId: string | null;
	onSelect: (user: NearbyUser) => void;
};

export function MiniMap({ users, radius, selectedUserId, onSelect }: MiniMapProps) {
	const markers = useMemo(
		() =>
			users.slice(0, 20).map((user) => ({
				user,
				positionClass: positionClassFor(user.user_id, radius),
			})),
		[users, radius],
	);

	return (
		<section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-3 text-white shadow-lg">
			<header className="flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Live mini-map</h2>
				<span className="text-xs text-white/60">Showing first {Math.min(users.length, 20)} peers</span>
			</header>
			<div className="relative mt-3.5 w-full">
				<div className="relative mx-auto aspect-square w-full max-w-[15rem] rounded-2xl border border-white/10 bg-slate-950/40">
					<div className="absolute inset-0">
						<div className="absolute inset-[18%] rounded-full border border-white/20" />
						<div className="absolute inset-[32%] rounded-full border border-white/12" />
						<div className="absolute inset-[46%] rounded-full border border-white/8" />
					</div>
					{markers.map(({ user, positionClass }) => {
						const isSelected = selectedUserId === user.user_id;
						return (
							<button
								key={user.user_id}
								type="button"
								onClick={() => onSelect(user)}
								className={`group absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 ${positionClass}`}
							>
								<span
									className={`absolute inset-0 rounded-full bg-emerald-400/20 blur-lg transition-opacity ${
										isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
									}`}
								/>
								<span
									className={`absolute inset-0 animate-ping rounded-full border-2 border-emerald-300/60 ${
										isSelected ? "opacity-80" : "opacity-0 group-hover:opacity-60"
									}`}
								/>
								<span
									className={`relative flex h-full w-full items-center justify-center rounded-full border border-white/40 bg-white/10 text-[0.65rem] font-semibold uppercase tracking-wide transition ${
										isSelected ? "bg-emerald-500 text-slate-900" : "text-white/80 hover:bg-emerald-400/80 hover:text-slate-900"
									}`}
								>
									{(user.display_name || user.handle || "?").slice(0, 2)}
								</span>
							</button>
						);
					})}
				</div>
			</div>
			<p className="mt-2.5 text-xs text-white/60">Tap a pulse to preview profile details and send a quick invite.</p>
		</section>
	);
}
