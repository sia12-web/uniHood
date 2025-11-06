"use client";

type ActivityInsight = {
	id: string;
	name: string;
	participants: number;
	emoji?: string;
	description?: string;
};

type ActivityPreviewProps = {
	activities: ActivityInsight[];
	loading: boolean;
	error: string | null;
	onLaunch: (activity: ActivityInsight) => void;
};

export function ActivityPreview({ activities, loading, error, onLaunch }: ActivityPreviewProps) {
	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
			<header className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-purple-900">Trending mini-activities nearby</h3>
				<span className="text-xs text-purple-700">Live pulse</span>
			</header>
			{loading ? <p className="text-xs text-purple-700">Scanning nearby rooms…</p> : null}
			{!loading && error ? <p className="text-xs text-rose-600">{error}</p> : null}
			{!loading && !error && activities.length === 0 ? (
				<p className="text-xs text-purple-800">No live mini-activities yet. Start one to get classmates joining faster!</p>
			) : null}
			{activities.length ? (
				<ul className="space-y-2">
					{activities.map((activity) => (
						<li key={activity.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow">
							<div>
								<p className="text-sm font-semibold text-slate-900">
									<span aria-hidden>{activity.emoji ?? "🎯"}</span>{" "}
									{activity.name}
								</p>
								<p className="text-xs text-slate-500">
									{activity.participants} student{activity.participants === 1 ? "" : "s"} nearby
								</p>
								{activity.description ? (
									<p className="text-xs text-slate-500">{activity.description}</p>
								) : null}
							</div>
							<button
								type="button"
								onClick={() => onLaunch(activity)}
								className="rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-purple-500"
							>
								Launch
							</button>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
