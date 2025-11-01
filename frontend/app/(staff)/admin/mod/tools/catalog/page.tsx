import { CatalogClient } from "./catalog-client";
import { requireAdmin } from "@/lib/admin-guard";

export default async function CatalogPage() {
	await requireAdmin();

	return <CatalogClient />;
}
