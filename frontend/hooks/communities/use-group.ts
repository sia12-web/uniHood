import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getGroup, type CommunityGroup } from "@/lib/communities";

export function useGroup(groupId: string, initialData?: CommunityGroup): UseQueryResult<CommunityGroup> {
	return useQuery({
		queryKey: ["group", groupId],
		queryFn: () => getGroup(groupId),
		staleTime: 60_000,
		initialData,
	});
}
