"use client";

import { useMemo } from "react";

import type { LinkageResponse } from "@/hooks/mod/linkage/use-linkage";

export type LinkageGraphNode = {
	id: string;
	label: string;
	riskBand?: string | null;
	role?: string | null;
	x: number;
	y: number;
	isPrimary?: boolean;
};

export type LinkageGraphEdge = {
	from: string;
	to: string;
	relation: string;
	strength: number;
};

const TWO_PI = Math.PI * 2;

export function useLinkageGraph(data: LinkageResponse | undefined) {
	return useMemo(() => {
		if (!data) {
			return { nodes: [] as LinkageGraphNode[], edges: [] as LinkageGraphEdge[] };
		}

		const peers = data.peers ?? [];
		const radius = Math.min(220, 80 + peers.length * 8);
		const nodes: LinkageGraphNode[] = [];
		const edges: LinkageGraphEdge[] = [];

		nodes.push({
			id: data.user.user_id,
			label: data.user.display_name ?? data.user.user_id,
			riskBand: data.user.risk_band,
			role: data.user.role ?? "user",
			x: 0,
			y: 0,
			isPrimary: true,
		});

		peers.forEach((peer, index) => {
			const angle = (index / Math.max(1, peers.length)) * TWO_PI;
			const x = Math.cos(angle) * radius;
			const y = Math.sin(angle) * radius;
			nodes.push({
				id: peer.user_id,
				label: peer.display_name ?? peer.user_id,
				riskBand: peer.risk_band,
				role: peer.role ?? "user",
				x,
				y,
		});

			peer.relations.forEach((relation) => {
				edges.push({
					from: data.user.user_id,
					to: peer.user_id,
					relation: relation.relation,
					strength: relation.strength,
				});
			});
		});

		return { nodes, edges };
	}, [data]);
}
