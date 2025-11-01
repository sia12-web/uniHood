import { BundlesClient } from "./bundles-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function BundlesPage() {
	await requireAdmin();
	return <BundlesClient />;
}
