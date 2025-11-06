import { redirect } from "next/navigation";

export default function SocialNearbyPage() {
  // This module was moved onto the homepage; keep legacy route but redirect.
  redirect("/");
}
