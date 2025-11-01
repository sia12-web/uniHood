import { NotificationsCenter } from "@/components/notifications/notifications-center";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  await requireCurrentUser();

  return <NotificationsCenter />;
}
