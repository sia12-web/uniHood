"use client";

import React, { FormEvent } from "react";

type SearchBarProps = {
	value: string;
	onChange(value: string): void;
	onSubmit?(): void;
	placeholder?: string;
	isSearching?: boolean;
	disabled?: boolean;
};

export default function SearchBar({
	value,
	onChange,
	onSubmit,
	placeholder = "Search by name or handle…",
	isSearching = false,
	disabled = false,
}: SearchBarProps) {
	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		onSubmit?.();
	};

	return (
		<form onSubmit={handleSubmit} className="relative flex w-full items-center gap-2">
			<label htmlFor="search-input" className="sr-only">
				Search query
			</label>
			<input
				id="search-input"
				type="search"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none"
			/>
			{value ? (
				<button
					type="button"
					onClick={() => onChange("")}
					className="text-xs text-slate-500 hover:text-slate-700"
					aria-label="Clear search"
				>
					Clear
				</button>
			) : null}
			<button
				type="submit"
				disabled={disabled}
				className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
			>
				{isSearching ? "Searching…" : "Search"}
			</button>
		</form>
	);
}
