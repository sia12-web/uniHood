import type { ReactNode } from "react";

import CommunitiesErrorBoundary from "@/components/communities/error-boundary";
import { Sidebar } from "@/components/communities/sidebar";
import { Topbar } from "@/components/communities/topbar";
import { QueryProvider } from "@/components/providers/query-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { requireCurrentUser } from "@/lib/auth-guard";

export default async function CommunitiesLayout({ children }: { children: ReactNode }) {
	const me = await requireCurrentUser();

	return (
		<QueryProvider>
			<SocketProvider userId={me.id}>
				<div className="flex min-h-screen flex-col bg-slate-50">
					<Topbar me={me} />
					<div className="relative flex flex-1 overflow-hidden">
						<Sidebar me={me} />
						<CommunitiesErrorBoundary>
							<main id="communities-main" className="flex-1 overflow-y-auto bg-slate-50">
								<div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">{children}</div>
							</main>
						</CommunitiesErrorBoundary>
					</div>
				</div>
			</SocketProvider>
		</QueryProvider>
	);
}
