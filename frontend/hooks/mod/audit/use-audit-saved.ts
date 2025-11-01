"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AuditQuery } from "./use-audit-list";

export type SavedAuditSearch = {
	id: string;
	name: string;
	query: AuditQuery;
	created_at: string;
};

type UseAuditSavedResult = {
	saved: SavedAuditSearch[];
	saveSearch: (name: string, query: AuditQuery) => SavedAuditSearch;
	removeSearch: (id: string) => void;
	renameSearch: (id: string, name: string) => void;
	reorderSearches: (startIndex: number, endIndex: number) => void;
};

const STORAGE_KEY = "mod:audit:saved-searches";

function readStorage(): SavedAuditSearch[] {
	if (typeof window === "undefined") {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw) as SavedAuditSearch[];
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item) => Boolean(item?.id && item?.name));
	} catch (error) {
		console.warn("Failed to parse saved audit searches", error);
		return [];
	}
}

function writeStorage(entries: SavedAuditSearch[]): void {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function generateId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return Math.random().toString(36).slice(2, 10);
}

export function useAuditSavedSearches(): UseAuditSavedResult {
	const [saved, setSaved] = useState<SavedAuditSearch[]>(() => readStorage());

	useEffect(() => {
		writeStorage(saved);
	}, [saved]);

	useEffect(() => {
		function handleStorage(event: StorageEvent) {
			if (event.key === STORAGE_KEY) {
				setSaved(readStorage());
			}
		}
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	const saveSearch = useCallback((name: string, query: AuditQuery) => {
		const trimmed = name.trim();
		const entry: SavedAuditSearch = {
			id: generateId(),
			name: trimmed || "Untitled search",
			query,
			created_at: new Date().toISOString(),
		};
		setSaved((current) => [...current, entry]);
		return entry;
	}, []);

	const removeSearch = useCallback((id: string) => {
		setSaved((current) => current.filter((entry) => entry.id !== id));
	}, []);

	const renameSearch = useCallback((id: string, name: string) => {
		const trimmed = name.trim();
		if (!trimmed) {
			return;
		}
		setSaved((current) => current.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry)));
	}, []);

	const reorderSearches = useCallback((startIndex: number, endIndex: number) => {
		setSaved((current) => {
			if (startIndex === endIndex) {
				return current;
			}
			const next = [...current];
			const [removed] = next.splice(startIndex, 1);
			if (!removed) {
				return current;
			}
			next.splice(endIndex, 0, removed);
			return next;
		});
	}, []);

	return useMemo(
		() => ({ saved, saveSearch, removeSearch, renameSearch, reorderSearches }),
		[saved, saveSearch, removeSearch, renameSearch, reorderSearches],
	);
}
