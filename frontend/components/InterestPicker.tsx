"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { InterestNode, MyInterest, VisibilityScope } from "@/lib/types";

type InterestPickerProps = {
	interests: MyInterest[];
	loading?: boolean;
	onAdd: (interest: InterestNode, visibility: VisibilityScope) => Promise<void>;
	onRemove: (interestId: string) => Promise<void>;
	onVisibilityChange: (interestId: string, visibility: VisibilityScope) => Promise<void>;
	onSuggest: (query: string) => Promise<InterestNode[]>;
};

const VISIBILITY_OPTIONS: VisibilityScope[] = ["everyone", "friends", "none"];

export default function InterestPicker({
	interests,
	loading = false,
	onAdd,
	onRemove,
	onVisibilityChange,
	onSuggest,
}: InterestPickerProps) {
	const [query, setQuery] = useState("");
	const [pending, setPending] = useState(false);
	const [suggestions, setSuggestions] = useState<InterestNode[]>([]);
	const [suggestLoading, setSuggestLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [newVisibility, setNewVisibility] = useState<VisibilityScope>("everyone");

	const takenIds = useMemo(() => new Set(interests.map((item) => item.interest_id)), [interests]);

	useEffect(() => {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			setSuggestions([]);
			setSuggestLoading(false);
			return;
		}
		let cancelled = false;
		setSuggestLoading(true);
		setError(null);
		onSuggest(trimmed)
			.then((nodes) => {
				if (cancelled) {
					return;
				}
				setSuggestions(nodes.filter((node) => !takenIds.has(node.id)));
			})
			.catch((err) => {
				if (cancelled) {
					return;
				}
				setError(err instanceof Error ? err.message : "Failed to load suggestions");
			})
			.finally(() => {
				if (!cancelled) {
					setSuggestLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [query, onSuggest, takenIds]);

	const handleAdd = useCallback(
		async (node: InterestNode) => {
			setPending(true);
			setError(null);
			setFeedback(null);
			try {
				await onAdd(node, newVisibility);
				setFeedback(`Added ${node.name}.`);
				setQuery("");
				setSuggestions([]);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to add interest");
			} finally {
				setPending(false);
			}
		},
		[onAdd, newVisibility],
	);

	const handleRemove = useCallback(
		async (interestId: string) => {
			setPending(true);
			setError(null);
			setFeedback(null);
			try {
				await onRemove(interestId);
				setFeedback("Interest removed.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to remove interest");
			} finally {
				setPending(false);
			}
		},
		[onRemove],
	);

	const handleVisibilityChange = useCallback(
		async (interestId: string, visibility: VisibilityScope) => {
			setPending(true);
			setError(null);
			setFeedback(null);
			try {
				await onVisibilityChange(interestId, visibility);
				setFeedback("Visibility updated.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update visibility");
			} finally {
				setPending(false);
			}
		},
		[onVisibilityChange],
	);

	return (
		<section className="space-y-4">
			<div className="space-y-2 rounded border border-slate-200 bg-white px-4 py-4">
				<h2 className="text-base font-semibold text-slate-900">Find interests</h2>
				<p className="text-sm text-slate-600">
					Search the shared taxonomy to add interests to your profile. Each interest can be visible to everyone, just
					friends, or hidden.
				</p>
				<div className="flex flex-col gap-3 md:flex-row md:items-center">
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Start typing (min. 2 characters)"
						className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<select
						value={newVisibility}
						onChange={(event) => setNewVisibility(event.target.value as VisibilityScope)}
						aria-label="Default interest visibility"
						className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none md:w-52"
					>
						<option value="everyone">Visible to everyone</option>
						<option value="friends">Friends only</option>
						<option value="none">Hidden</option>
					</select>
				</div>
				{suggestLoading ? <p className="text-xs text-slate-500">Looking up suggestions…</p> : null}
				{suggestions.length > 0 ? (
					<ul className="divide-y divide-slate-200 text-sm">
						{suggestions.map((node) => (
							<li key={node.id} className="flex items-center justify-between py-2">
								<div>
									<p className="font-medium text-slate-900">{node.name}</p>
									<p className="text-xs text-slate-500">{node.slug}</p>
								</div>
								<button
									type="button"
									onClick={() => handleAdd(node)}
									disabled={pending}
									className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
								>
									Add
								</button>
							</li>
						))}
					</ul>
				) : null}
				{query.trim().length >= 2 && !suggestLoading && suggestions.length === 0 ? (
					<p className="text-xs text-slate-500">No suggestions found for “{query.trim()}”.</p>
				) : null}
			</div>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<section className="space-y-2">
				<h3 className="text-base font-semibold text-slate-900">Your interests</h3>
				{loading && interests.length === 0 ? (
					<p className="text-sm text-slate-500">Loading interests…</p>
				) : null}
				{!loading && interests.length === 0 ? (
					<p className="text-sm text-slate-500">You have not added any interests yet.</p>
				) : null}
				{interests.length > 0 ? (
					<table className="w-full table-fixed border-collapse text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wide text-slate-500">
								<th className="w-1/3 pb-2">Name</th>
								<th className="w-1/3 pb-2">Slug</th>
								<th className="w-1/4 pb-2">Visibility</th>
								<th className="w-16 pb-2" aria-label="actions" />
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200">
							{interests.map((item) => (
								<tr key={item.interest_id} className="align-middle">
									<td className="py-2 font-medium text-slate-900">{item.name}</td>
									<td className="py-2 text-slate-500">{item.slug}</td>
									<td className="py-2">
										<select
											value={item.visibility}
											onChange={(event) =>
												handleVisibilityChange(item.interest_id, event.target.value as VisibilityScope)
											}
											disabled={pending}
											aria-label={`Change visibility for ${item.name}`}
											className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
										>
											{VISIBILITY_OPTIONS.map((option) => (
												<option key={option} value={option}>
													{option === "everyone" ? "Everyone" : option === "friends" ? "Friends" : "Hidden"}
												</option>
											))}
										</select>
									</td>
									<td className="py-2 text-right">
										<button
											type="button"
											onClick={() => handleRemove(item.interest_id)}
											disabled={pending}
											className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
										>
											Remove
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : null}
			</section>
		</section>
	);
}
