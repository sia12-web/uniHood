import { PageHeader } from "@/components/communities/page-header";

export default function GroupSettingsPage({ params }: { params: { groupId: string } }) {
	return (
		<div className="flex flex-col gap-6" data-testid="communities-group-settings">
			<PageHeader
				title="Group settings"
				description={`Controls for ${params.groupId} will arrive once the access policies and audit logging endpoints ship.`}
			/>
			<p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-600">
				Role management, membership approvals, and moderation tools are part of Phase B. For now, reach out to the platform team to adjust membership manually.
			</p>
		</div>
	);
}
