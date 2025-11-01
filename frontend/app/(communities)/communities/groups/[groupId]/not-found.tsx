import Link from "next/link";

import { EmptyState } from "@/components/communities/empty-state";

export default function GroupNotFound() {
	return (
		<EmptyState
			title="Group not found"
			description="The group you are looking for may have been archived or you do not have access yet."
			cta={
				<Link
					href="/communities/groups"
					className="inline-flex items-center justify-center rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-navy"
				>
					Back to groups
				</Link>
			}
		/>
	);
}
