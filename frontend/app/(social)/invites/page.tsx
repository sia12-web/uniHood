import { redirect } from "next/navigation";

export default function InvitesPage() {
  redirect("/friends?filter=pending");
}
