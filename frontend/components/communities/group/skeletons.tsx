"use client";

function skeleton(className: string) {
	return `animate-pulse rounded-lg bg-slate-200 ${className}`;
}

export function GroupHeaderSkeleton() {
	return (
		<div className={skeleton("h-40 w-full")} aria-hidden />
	);
}

export function ComposerSkeleton() {
	return (
		<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
			<div className={skeleton("h-4 w-32")} />
			<div className={skeleton("h-10 w-full")} />
			<div className={skeleton("h-24 w-full")} />
		</div>
	);
}

export function PostCardSkeleton() {
	return (
		<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
			<div className="flex items-center gap-3">
				<div className={skeleton("h-10 w-10 rounded-full")} />
				<div className="flex-1 space-y-2">
					<div className={skeleton("h-3 w-32")} />
					<div className={skeleton("h-3 w-24")} />
				</div>
			</div>
			<div className={skeleton("h-24 w-full")} />
		</div>
	);
}
