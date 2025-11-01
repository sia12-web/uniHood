import Link from "next/link";

import { EmptyState } from "@/components/communities/empty-state";
import { PageHeader } from "@/components/communities/page-header";

export default function GroupsIndexPage() {
	return (
		<div className="flex flex-col gap-8" data-testid="communities-groups-index">
			<PageHeader
				title="Your communities"
				description="Browse every group across campus. Search refinement, filters, and sorting will land once the backend query endpoints open up."
				actions={
					<Link
						href="/communities/new"
						className="inline-flex items-center justify-center rounded-full bg-midnight px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-navy"
					>
						Create group
					</Link>
				}
			/>
			<EmptyState
				title="Group directory is on deck"
				description="Phase B wires in filterable lists with server-driven pagination. For now, use the quick links in the sidebar to jump to active conversations."
			/>
		</div>
	);
}
