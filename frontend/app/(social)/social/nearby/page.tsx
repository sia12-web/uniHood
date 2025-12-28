import { redirect } from "next/navigation";

export default function SocialNearbyPage() {
  // This module was moved onto the socials page; keep legacy route but redirect.
  redirect("/socials");
}
