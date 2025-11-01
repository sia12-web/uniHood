"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CommunityGroup } from "@/lib/communities";

const GroupContext = createContext<CommunityGroup | null>(null);

export function GroupProvider({ group, children }: { group: CommunityGroup; children: ReactNode }) {
	return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}

export function useGroupContext(): CommunityGroup {
	const value = useContext(GroupContext);
	if (!value) {
		throw new Error("useGroupContext must be used within a GroupProvider");
	}
	return value;
}
