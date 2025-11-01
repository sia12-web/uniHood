import type { ReactNode } from "react";

import { StaffBreadcrumb } from "@/components/mod/shell/breadcrumb";
import { StaffSidebar } from "@/components/mod/shell/sidebar";
import { StaffTopbar } from "@/components/mod/shell/topbar";
import { QueryProvider } from "@/components/providers/query-provider";
import { StaffProvider } from "@/components/providers/staff-provider";
import { requireStaff } from "@/lib/staff-auth-guard";

export default async function ModeratorWorkspaceLayout({ children }: { children: ReactNode }) {
	const { profile, activeCampus, availableCampuses } = await requireStaff("moderator");

	return (
		<QueryProvider>
			<StaffProvider profile={profile} activeCampus={activeCampus} campuses={availableCampuses}>
				<div className="flex min-h-screen bg-slate-50">
					<StaffSidebar />
					<div className="flex flex-1 flex-col">
						<StaffTopbar profile={profile} activeCampus={activeCampus} campuses={availableCampuses} />
						<StaffBreadcrumb />
						<main className="flex-1 overflow-y-auto px-4 py-6 lg:px-6">
							<div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
						</main>
					</div>
				</div>
			</StaffProvider>
		</QueryProvider>
	);
}
