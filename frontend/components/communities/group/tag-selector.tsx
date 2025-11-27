"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { searchTags } from "@/lib/communities";

function useDebouncedValue(value: string, delay: number) {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);

	return debounced;
}

type TagSelectorProps = {
	value: string[];
	onChange: (next: string[]) => void;
	disabled?: boolean;
	limit?: number;
};

export function TagSelector({ value, onChange, disabled = false, limit = 10 }: TagSelectorProps) {
	const [input, setInput] = useState("");
	const query = useDebouncedValue(input, 250);
	const [suggestionPool, setSuggestionPool] = useState<string[]>([]);

	useEffect(() => {
		const trimmed = query.trim().toLowerCase();
		if (trimmed.length < 2 || disabled) {
			setSuggestionPool([]);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const result = await searchTags(trimmed);
				if (!cancelled) {
					setSuggestionPool(result?.tags ?? []);
				}
			} catch {
				if (!cancelled) {
					setSuggestionPool([]);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [disabled, query]);

	const suggestions = useMemo(() => {
		return suggestionPool.filter((tag) => !value.includes(tag)).slice(0, 8);
	}, [suggestionPool, value]);

	const remaining = limit - value.length;

	const addTag = useCallback(
		(tag: string) => {
			if (!tag) {
				return;
			}
			if (value.includes(tag) || value.length >= limit) {
				return;
			}
			onChange([...value, tag]);
			setInput("");
		},
		[limit, onChange, value],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter" || event.key === ",") {
				event.preventDefault();
				const trimmed = input.trim().toLowerCase();
				addTag(trimmed);
			}
			if (event.key === "Backspace" && input.length === 0 && value.length > 0) {
				event.preventDefault();
				onChange(value.slice(0, value.length - 1));
			}
		},
		[addTag, input, onChange, value],
	);

	const removeTag = useCallback(
		(tag: string) => {
			onChange(value.filter((item) => item !== tag));
		},
		[onChange, value],
	);

	return (
		<section className="space-y-2">
			<label className="text-sm font-medium text-slate-700">Tags</label>
			<div className="flex flex-wrap gap-2">
				{value.map((tag) => (
					<span key={tag} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
						#{tag}
						<button
							 type="button"
							 onClick={() => removeTag(tag)}
							 className="rounded-full bg-slate-200 px-1 text-xs text-slate-600 transition hover:bg-slate-300 hover:text-slate-800"
							 aria-label={`Remove ${tag}`}
						>
							×
						</button>
					</span>
				))}
			</div>
			<div className="space-y-1">
				<input
					type="text"
					value={input}
					onChange={(event) => setInput(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={remaining > 0 ? `Add up to ${remaining} more` : "Tag limit reached"}
					disabled={disabled || remaining <= 0}
					className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20 disabled:cursor-not-allowed disabled:opacity-70"
				/>
				{suggestions.length > 0 ? (
					<ul className="flex flex-wrap gap-2">
						{suggestions.map((tag) => (
							<li key={tag}>
								<button
									type="button"
									onClick={() => addTag(tag)}
									className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight"
								>
									#{tag}
								</button>
							</li>
						))}
					</ul>
				) : null}
				{remaining <= 0 ? <p className="text-xs text-slate-500">Tag limit reached.</p> : null}
			</div>
		</section>
	);
}
