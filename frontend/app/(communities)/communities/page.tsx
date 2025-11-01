import Link from "next/link";

import { PageHeader } from "@/components/communities/page-header";
import { EmptyState } from "@/components/communities/empty-state";
import { listGroups, type CommunityGroup } from "@/lib/communities";

function GroupCard({ group }: { group: CommunityGroup }) {
	return (
		<article className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
			<div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
				<span>{group.visibility} group</span>
				<span>{group.tags.length ? group.tags.join(" · ") : "Open topics"}</span>
			</div>
			<div>
				<h2 className="text-xl font-semibold text-slate-900">{group.name}</h2>
				<p className="mt-2 line-clamp-3 text-sm text-slate-600">{group.description || "Conversations happen here."}</p>
			</div>
			<div className="flex items-center justify-between text-sm text-slate-500">
				<span>Created {new Date(group.created_at).toLocaleDateString()}</span>
				<Link
					href={`/communities/${group.slug}`}
					className="inline-flex items-center gap-1 rounded-full bg-warm-sand/80 px-3 py-1 font-semibold text-midnight transition hover:bg-warm-sand"
				>
					Explore ↗
				</Link>
			</div>
		</article>
	);
}

export default async function CommunitiesHubPage() {
	let groups: CommunityGroup[] = [];
	try {
		groups = await listGroups({ limit: 12 });
	} catch (error) {
		console.warn("Failed to load communities", error);
	}

	return (
		<div className="flex flex-col gap-10">
			<PageHeader
				title="Discover and grow your campus circles"
				description="Browse public groups to see where conversations are unfolding, then dive deeper to post updates, share files, react, and coordinate your next meetup. Private and secret communities stay tucked away until you join."
				actions={
					<div className="flex items-center gap-2">
						<Link
							href="/communities/feed"
							className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-midnight hover:text-midnight"
						>
							View feed
						</Link>
						<Link
							href="/communities/new"
							className="inline-flex items-center justify-center rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-navy"
						>
							Start a community
						</Link>
					</div>
				}
			/>
			{groups.length === 0 ? (
				<EmptyState
					title="No communities yet"
					description="Spin up your first group to rally teammates, classmates, or mentors. Posts, comments, reactions, and media uploads are ready to go once you create a space."
					cta={
						<Link
							href="/communities/new"
							className="inline-flex items-center justify-center rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-navy"
						>
							Start a community
						</Link>
					}
				/>
			) : (
				<section className="grid gap-5 md:grid-cols-2">
					{groups.map((group) => (
						<GroupCard key={group.id} group={group} />
					))}
				</section>
			)}
			<section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
				<h2 className="text-xl font-semibold text-slate-900">Community playbook</h2>
				<p className="mt-2 max-w-3xl text-sm text-slate-600">
					Keep momentum high by layering realtime posts, structured comments, and reactions with automated indexing. Every group syncs to the outbox and Redis streams we added in this phase, so the campus feed stays fresh.
				</p>
				<ul className="mt-6 grid gap-4 md:grid-cols-3">
					{[
						{
							title: "Post quickly",
							copy: "Draft, schedule, and pin posts so newcomers see the latest wins the moment they join.",
						},
						{
							title: "React & respond",
							copy: "Emoji reactions keep the pulse visible, while threaded comments dig into details without clutter.",
						},
						{
							title: "Share media",
							copy: "Upload photos, slides, or recordings. Attachment limits keep everything fast and mobile-ready.",
						},
					].map((tip) => (
						<li key={tip.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
							<h3 className="text-base font-semibold text-slate-900">{tip.title}</h3>
							<p className="mt-2 text-sm text-slate-600">{tip.copy}</p>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
