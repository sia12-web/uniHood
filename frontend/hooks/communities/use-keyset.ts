import { useCallback } from "react";

export type KeysetPage<T> = {
	items: T[];
	next_cursor?: string | null;
};

export function useKeyset<T>() {
	const getNextPageParam = useCallback((lastPage: KeysetPage<T>) => {
		return lastPage.next_cursor ?? undefined;
	}, []);

	const flattenPages = useCallback((pages: KeysetPage<T>[] | undefined) => {
		if (!pages) {
			return [] as T[];
		}
		return pages.flatMap((page) => page.items ?? []);
	}, []);

	return { getNextPageParam, flattenPages };
}
