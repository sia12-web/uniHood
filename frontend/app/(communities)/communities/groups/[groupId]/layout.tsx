import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { GroupHeader } from "@/components/communities/group/header";
import { GroupProvider } from "@/components/communities/group/context";
import { GroupTabs } from "@/components/communities/group/tabs";
import { getGroup } from "@/lib/communities";

export default async function GroupLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: { groupId: string };
}) {
	let group;
	try {
		group = await getGroup(params.groupId);
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("Failed to load group", params.groupId, error);
		}
		group = null;
	}

	if (!group) {
		notFound();
	}

	return (
		<GroupProvider group={group}>
			<div className="flex flex-col gap-6">
				<GroupHeader group={group} />
				<GroupTabs groupId={group.id} />
				<div className="flex flex-col gap-6">{children}</div>
			</div>
		</GroupProvider>
	);
}
