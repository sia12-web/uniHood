"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";

import type { MyLink, VisibilityScope } from "@/lib/types";

type LinkEditorProps = {
	links: MyLink[];
	loading?: boolean;
	onUpsert: (params: { kind: string; url: string; visibility: VisibilityScope }) => Promise<void>;
	onRemove: (kind: string) => Promise<void>;
	onVisibilityChange: (kind: string, visibility: VisibilityScope) => Promise<void>;
};

const VISIBILITY_OPTIONS: VisibilityScope[] = ["everyone", "friends", "none"];

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9.+-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export default function LinkEditor({ links, loading = false, onUpsert, onRemove, onVisibilityChange }: LinkEditorProps) {
	const [editingKind, setEditingKind] = useState<string | undefined>(undefined);
	const [kind, setKind] = useState("");
	const [url, setUrl] = useState("");
	const [visibility, setVisibility] = useState<VisibilityScope>("everyone");
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const isSubmitDisabled = useMemo(() => kind.trim().length === 0 || url.trim().length === 0, [kind, url]);

	const resetForm = useCallback(() => {
		setEditingKind(undefined);
		setKind("");
		setUrl("");
		setVisibility("everyone");
	}, []);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (isSubmitDisabled) {
				return;
			}
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onUpsert({
					kind: slugify(kind),
					url: url.trim(),
					visibility,
				});
				setFeedback(editingKind ? "Link updated." : "Link added.");
				resetForm();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to save link");
			} finally {
				setPending(false);
			}
		},
		[editingKind, kind, url, visibility, onUpsert, isSubmitDisabled, resetForm],
	);

	const handleRemove = useCallback(
		async (slug: string) => {
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onRemove(slug);
				if (editingKind === slug) {
					resetForm();
				}
				setFeedback("Link removed.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to remove link");
			} finally {
				setPending(false);
			}
		},
		[editingKind, onRemove, resetForm],
	);

	const handleVisibility = useCallback(
		async (slug: string, next: VisibilityScope) => {
			setPending(true);
			setFeedback(null);
			setError(null);
			try {
				await onVisibilityChange(slug, next);
				setFeedback("Visibility updated.");
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to update visibility");
			} finally {
				setPending(false);
			}
		},
		[onVisibilityChange],
	);

	const startEditing = useCallback(
		(link: MyLink) => {
			setEditingKind(link.kind);
			setKind(link.kind);
			setUrl(link.url);
			setVisibility(link.visibility);
		},
		[],
	);

	return (
		<section className="space-y-4">
			<form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 bg-white px-4 py-4">
				<h2 className="text-base font-semibold text-slate-900">{editingKind ? "Edit link" : "Add a link"}</h2>
				<p className="text-sm text-slate-600">
					Share destinations like personal sites, portfolios or social profiles. Provide a short label and the full URL.
				</p>
				<div className="grid gap-3 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Slug</span>
						<input
							type="text"
							value={kind}
							onChange={(event) => setKind(event.target.value)}
							maxLength={32}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<span className="text-xs text-slate-500">Example: github, linkedin, portfolio.</span>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">URL</span>
						<input
							type="url"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://example.com"
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
					</label>
				</div>
				<label className="flex flex-col gap-1 text-sm text-slate-700 md:w-64">
					<span className="font-medium">Visibility</span>
					<select
						aria-label="Link visibility"
						value={visibility}
						onChange={(event) => setVisibility(event.target.value as VisibilityScope)}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					>
						<option value="everyone">Everyone</option>
						<option value="friends">Friends</option>
						<option value="none">Hidden</option>
					</select>
				</label>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						disabled={pending || isSubmitDisabled}
						className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
					>
						{pending ? "Saving…" : editingKind ? "Update link" : "Add link"}
					</button>
					{editingKind ? (
						<button
							type="button"
							onClick={resetForm}
							disabled={pending}
							className="text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
						>
							Cancel
						</button>
					) : null}
				</div>
			</form>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<section className="space-y-2">
				<h3 className="text-base font-semibold text-slate-900">Your links</h3>
				{loading && links.length === 0 ? <p className="text-sm text-slate-500">Loading links…</p> : null}
				{!loading && links.length === 0 ? <p className="text-sm text-slate-500">No links yet. Add one above.</p> : null}
				{links.length > 0 ? (
					<table className="w-full table-fixed border-collapse text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wide text-slate-500">
								<th className="w-1/3 pb-2">Slug</th>
								<th className="w-1/3 pb-2">URL</th>
								<th className="w-32 pb-2">Visibility</th>
								<th className="w-24 pb-2" aria-label="actions" />
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200">
							{links.map((link) => (
								<tr key={link.kind}>
									<td className="py-2 font-medium text-slate-900">{link.kind}</td>
									<td className="py-2 text-slate-500">
										<a href={link.url} target="_blank" rel="noopener noreferrer" className="text-slate-600 underline">
											{link.url}
										</a>
									</td>
									<td className="py-2">
										<select
											aria-label="Link visibility"
											value={link.visibility}
											onChange={(event) =>
												handleVisibility(link.kind, event.target.value as VisibilityScope)
											}
											disabled={pending}
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
										<div className="flex justify-end gap-3">
											<button
												type="button"
												onClick={() => startEditing(link)}
												disabled={pending}
												className="text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
											>
												Edit
											</button>
											<button
												type="button"
												onClick={() => handleRemove(link.kind)}
												disabled={pending}
												className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
											>
												Remove
											</button>
										</div>
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
