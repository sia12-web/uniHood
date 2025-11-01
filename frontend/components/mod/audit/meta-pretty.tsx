"use client";

import { useCallback, useMemo, useState } from "react";

import { redactMeta } from "@/lib/redact-meta";

export type MetaPrettyProps = {
	meta: Record<string, unknown>;
	isAdmin: boolean;
	allowlist?: string[];
	collapsedLines?: number;
};

const COLLAPSE_THRESHOLD = 12;

export function MetaPretty({ meta, isAdmin, allowlist, collapsedLines = COLLAPSE_THRESHOLD }: MetaPrettyProps) {
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);

	const sanitized = useMemo(
		() => redactMeta(meta as Record<string, unknown>, { isAdmin, allowlist }),
		[meta, isAdmin, allowlist],
	);

	const formatted = useMemo(() => JSON.stringify(sanitized, null, 2) ?? "{}", [sanitized]);
	const totalLines = useMemo(() => formatted.split("\n"), [formatted]);
	const shouldCollapse = totalLines.length > collapsedLines;

	const visibleText = useMemo(() => {
		if (!shouldCollapse || expanded) {
			return formatted;
		}
		return `${totalLines.slice(0, collapsedLines).join("\n")}\n…`;
	}, [expanded, formatted, shouldCollapse, totalLines, collapsedLines]);

	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(formatted);
			setCopied(true);
			setTimeout(() => setCopied(false), 2_000);
		} catch (error) {
			console.warn("clipboard copy failed", error);
		}
	}, [formatted]);

	return (
		<div className="rounded-lg border border-slate-200 bg-slate-50">
			<div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				<span>Meta</span>
				<button type="button" onClick={copy} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400">
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<pre className="max-h-64 overflow-auto px-3 py-3 text-xs leading-5 text-slate-700">
				{visibleText}
			</pre>
			{shouldCollapse ? (
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="w-full border-t border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			) : null}
		</div>
	);
}
