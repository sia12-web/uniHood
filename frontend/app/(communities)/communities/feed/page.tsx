import { FeedView } from "@/components/communities/feed/feed-view";
import type { CurrentUser } from "@/lib/auth-guard";
import { requireCurrentUser } from "@/lib/auth-guard";

export const metadata = {
  title: "Community Feed",
};

export default async function CommunitiesFeedPage() {
  const currentUser: CurrentUser = await requireCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <FeedView
        scope={{ type: "user" }}
        currentUser={currentUser}
        header="Campus feed"
        description="Posts from your communities refresh in realtime with reactions and comments ready to jump in."
      />
    </div>
  );
}
