import React from "react";

import type { RoomDiscoverResult } from "@/lib/types";

type RoomResultCardProps = {
	room: RoomDiscoverResult;
	onVisit?(roomId: string): void;
};

export default function RoomResultCard({ room, onVisit }: RoomResultCardProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
			<div className="space-y-1 text-sm">
				<p className="font-semibold text-slate-900">{room.name}</p>
				<p className="text-xs text-slate-500">Preset {room.preset} • Members {room.members_count}</p>
				<p className="text-xs text-slate-500">Messages last 24h: {room.msg_24h} • Score {room.score.toFixed(2)}</p>
			</div>
			{onVisit ? (
				<button
					type="button"
					onClick={() => onVisit(room.room_id)}
					className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-800"
				>
					View
				</button>
			) : null}
		</div>
	);
}
