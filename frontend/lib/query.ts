import { QueryClient } from "@tanstack/react-query";

export const defaultQueryOptions = {
	queries: {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		suspense: false,
	},
};

export function createQueryClient(): QueryClient {
	return new QueryClient({ defaultOptions: defaultQueryOptions });
}
