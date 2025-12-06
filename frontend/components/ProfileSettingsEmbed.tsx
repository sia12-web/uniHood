"use client";

// Simplified profile settings for embedding in the dashboard
// Just renders the full profile page component
import dynamic from "next/dynamic";

const ProfileSettingsPage = dynamic(
  () => import("@/app/(identity)/settings/profile/page"),
  { ssr: false }
);

export default function ProfileSettingsEmbed() {
  return <ProfileSettingsPage />;
}
