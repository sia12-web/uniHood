import { ComposerSkeleton, GroupHeaderSkeleton, PostCardSkeleton } from "@/components/communities/group/skeletons";

export default function GroupDetailsLoading() {
	return (
		<div className="flex flex-col gap-6" aria-label="Loading group details">
			<GroupHeaderSkeleton />
			<ComposerSkeleton />
			<div className="space-y-4">
				{Array.from({ length: 3 }).map((_, index) => (
					<PostCardSkeleton key={index} />
				))}
			</div>
		</div>
	);
}
