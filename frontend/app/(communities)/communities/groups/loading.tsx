import { CardSkeleton } from "@/components/communities/skeletons";

export default function GroupsLoading() {
	return (
		<div className="flex flex-col gap-6" aria-label="Loading groups">
			<div className="grid gap-4 md:grid-cols-2">
				{Array.from({ length: 4 }).map((_, index) => (
					<CardSkeleton key={index} />
				))}
			</div>
		</div>
	);
}
