import { useQuery } from "@tanstack/react-query";

import { listGroupMembers, type GroupMembersResponse } from "@/lib/communities";

export function groupMembersKey(groupId: string) {
  return ["groupMembers", groupId] as const;
}

export function useGroupMembers(groupId: string, params?: { limit?: number }) {
  const query = useQuery<GroupMembersResponse>({
    queryKey: groupMembersKey(groupId),
    queryFn: () => listGroupMembers(groupId, { limit: params?.limit ?? 50 }),
    staleTime: 15_000,
  });

  return {
    ...query,
    members: query.data?.items ?? [],
  };
}
