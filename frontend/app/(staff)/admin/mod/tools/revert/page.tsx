import { RevertClient } from "./revert-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function RevertPage() {
	await requireAdmin();
	return <RevertClient />;
}
