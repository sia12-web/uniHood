"use client";

export function LockedBanner() {
	return (
		<div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
			<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 font-semibold">!</span>
			<div>
				<p className="font-semibold">This group is locked right now.</p>
				<p className="text-amber-700">Moderators are preparing the next drop. You will get a notification as soon as posting opens.</p>
			</div>
		</div>
	);
}
