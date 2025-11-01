"use client";

import type { LinkageGraphEdge, LinkageGraphNode } from "@/hooks/mod/linkage/use-linkage-graph";

const BAND_COLORS: Record<string, string> = {
	good: "#34d399",
	neutral: "#94a3b8",
	watch: "#f59e0b",
	risk: "#f97316",
	bad: "#f43f5e",
};

function resolveColor(band?: string | null) {
	if (!band) return "#1e293b";
	return BAND_COLORS[band] ?? "#1e293b";
}

export type LinkageGraphProps = {
	nodes: LinkageGraphNode[];
	edges: LinkageGraphEdge[];
	onSelectNode?: (nodeId: string) => void;
};

export function LinkageGraph({ nodes, edges, onSelectNode }: LinkageGraphProps) {
	const size = 520;
	const center = size / 2;
	const scale = (value: number) => center + value;

	return (
		<div className="relative">
			<svg viewBox={`0 0 ${size} ${size}`} className="h-[360px] w-full">
				<defs>
					<filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
						<feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.15" />
					</filter>
				</defs>
				<g>
					{edges.map((edge) => {
						const source = nodes.find((node) => node.id === edge.from);
						const target = nodes.find((node) => node.id === edge.to);
						if (!source || !target) return null;
						return (
							<g key={`${edge.from}-${edge.to}-${edge.relation}`}>
								<line
									x1={scale(source.x)}
									y1={scale(source.y)}
									x2={scale(target.x)}
									y2={scale(target.y)}
									stroke="#cbd5f5"
									strokeWidth={Math.max(1, edge.strength / 10)}
									strokeDasharray={edge.relation.includes("ip") ? "4 4" : undefined}
								/>
								<text
									x={(scale(source.x) + scale(target.x)) / 2}
									y={(scale(source.y) + scale(target.y)) / 2 - 6}
									textAnchor="middle"
									className="fill-slate-500 text-[10px]"
								>
									{edge.relation}
								</text>
							</g>
						);
					})}
				</g>
				{nodes.map((node) => {
					const x = scale(node.x);
					const y = scale(node.y);
					const size = node.isPrimary ? 18 : 12;
					return (
						<g key={node.id} transform={`translate(${x}, ${y})`} className="cursor-pointer" onClick={() => onSelectNode?.(node.id)}>
							<circle r={size} fill={resolveColor(node.riskBand)} filter="url(#nodeShadow)" stroke="white" strokeWidth={3} />
							<text y={size + 16} textAnchor="middle" className="fill-slate-700 text-[11px]">
								{node.label}
							</text>
							{textBadge(node.role, size)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

function textBadge(role: string | null | undefined, radius: number) {
	if (!role || role === "user") return null;
	const label = role === "moderator" ? "MOD" : role === "admin" ? "ADMIN" : role.toUpperCase();
	return (
		<g>
			<rect x={-radius} y={-radius - 22} width={radius * 2} height={16} rx={8} fill="#0f172a" opacity={0.85} />
			<text x={0} y={-radius - 10} textAnchor="middle" className="fill-white text-[10px] font-semibold">
				{label}
			</text>
		</g>
	);
}
