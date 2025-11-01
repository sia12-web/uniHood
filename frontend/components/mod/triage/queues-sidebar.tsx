"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type QueueDefinition = {
	key: string;
	label: string;
	count?: number | null;
	slaBreaches?: number | null;
	description?: string;
	isCustom?: boolean;
};

export type QueuesSidebarProps = {
	queues: QueueDefinition[];
	activeKey: string | null;
	basePath: string;
	onCreateCustom?(filters: string): void;
	onRenameQueue?(queueKey: string): void;
	onDeleteQueue?(queueKey: string): void;
};

export function QueuesSidebar({ queues, activeKey, basePath, onCreateCustom, onRenameQueue, onDeleteQueue }: QueuesSidebarProps) {
	const [customFilters, setCustomFilters] = useState("");
	const sorted = useMemo(() => queues.slice().sort((a, b) => (b.count ?? 0) - (a.count ?? 0)), [queues]);

	return (
		<aside className="flex h-full w-full flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:w-72">
			<header>
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Queues</h2>
			</header>
			<nav className="flex-1 space-y-2 overflow-y-auto">
				{sorted.map((queue) => {
					const href = queue.key ? `${basePath}/${queue.key}` : basePath;
					const isActive = (activeKey ?? "") === queue.key;
					return (
						<div key={queue.key || "default"} className={`rounded-2xl border ${isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
							<Link
								href={href}
								className={`flex items-center justify-between px-4 py-3 text-sm ${
									isActive ? "text-white" : "text-slate-700 hover:border-slate-300"
								}`}
							>
								<div className="space-y-1">
									<p className="font-semibold">{queue.label}</p>
									{queue.description ? <p className={`text-xs ${isActive ? "text-slate-200" : "text-slate-500"}`}>{queue.description}</p> : null}
								</div>
								<div className="flex flex-col items-end text-xs font-semibold">
									{typeof queue.count === "number" ? <span>{queue.count}</span> : null}
									{queue.slaBreaches ? <span className={isActive ? "text-rose-200" : "text-rose-600"}>⚠ {queue.slaBreaches}</span> : null}
								</div>
							</Link>
							{queue.isCustom && (onRenameQueue || onDeleteQueue) ? (
								<div className={`flex justify-end gap-2 border-t px-4 py-2 text-xs ${isActive ? "border-slate-700 text-slate-200" : "border-slate-200 text-slate-500"}`}>
									{onRenameQueue ? (
										<button
											type="button"
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												onRenameQueue(queue.key);
											}}
											className={`rounded-full border px-3 py-1 font-semibold transition ${
												isActive ? "border-slate-700 hover:border-slate-600" : "border-slate-200 hover:border-slate-300"
											}`}
										>
											Rename
										</button>
									) : null}
									{onDeleteQueue ? (
										<button
											type="button"
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												onDeleteQueue(queue.key);
											}}
											className={`rounded-full border px-3 py-1 font-semibold transition ${
												isActive ? "border-slate-700 hover:border-slate-600" : "border-slate-200 hover:border-slate-300"
											}`}
										>
											Delete
										</button>
									) : null}
								</div>
							) : null}
						</div>
					);
				})}
			</nav>
			{onCreateCustom ? (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (!customFilters.trim()) return;
						onCreateCustom(customFilters.trim());
						setCustomFilters("");
					}}
					className="space-y-2"
				>
					<label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="custom-queue-input">
						Custom filters
					</label>
					<input
						id="custom-queue-input"
						type="text"
						value={customFilters}
						onChange={(event) => setCustomFilters(event.target.value)}
						className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
						placeholder="status=open&campus=north"
					/>
					<button
						type="submit"
						className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
					>
						Save queue
					</button>
				</form>
			) : null}
		</aside>
	);
}
