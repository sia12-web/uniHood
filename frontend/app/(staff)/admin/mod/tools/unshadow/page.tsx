import { UnshadowClient } from "./unshadow-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function UnshadowPage() {
	await requireAdmin();
	return <UnshadowClient />;
}
