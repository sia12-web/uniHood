import { JobsClient } from "./jobs-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function JobsPage() {
	await requireAdmin();
	return <JobsClient />;
}
