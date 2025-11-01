import { ToolsHomeCards } from "@/components/mod/tools/home-cards";
import { requireAdmin } from "@/lib/admin-guard";

export default async function ToolsHomePage() {
	await requireAdmin();

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold text-slate-900">Admin tools</h1>
				<p className="text-sm text-slate-600">Phase D safety tools for staff.admin roles. Choose a workflow to begin.</p>
			</header>
			<ToolsHomeCards />
		</div>
	);
}
