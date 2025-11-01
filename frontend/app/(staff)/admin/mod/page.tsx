import { redirect } from "next/navigation";

export default function ModeratorIndexPage() {
	redirect("/admin/mod/cases");
}
