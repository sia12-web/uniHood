import type { CaseTimelineEvent } from "@/hooks/mod/use-case";

export type CaseTimelineProps = {
	events?: CaseTimelineEvent[];
};

export function CaseTimeline({ events }: CaseTimelineProps) {
	if (!events?.length) {
		return <p className="text-sm text-slate-500">No timeline entries yet.</p>;
	}

	return (
		<ol className="space-y-4">
			{events.map((event) => (
				<li key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<div className="flex items-center justify-between">
						<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{event.type}</span>
						<span className="text-xs text-slate-400">{new Date(event.occurred_at).toLocaleString()}</span>
					</div>
					<p className="mt-2 text-sm text-slate-700">{event.description}</p>
					{event.actor && <p className="mt-1 text-xs text-slate-500">Actor: {event.actor}</p>}
				</li>
			))}
		</ol>
	);
}
