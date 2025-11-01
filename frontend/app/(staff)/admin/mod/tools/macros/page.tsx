import { MacrosClient } from "./macros-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function MacrosPage() {
	await requireAdmin();
	return <MacrosClient />;
}
