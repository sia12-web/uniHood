import type { ReactNode } from "react";

import { SocialHubShell } from "@/components/social/SocialHubShell";

export default function SocialLayout({ children }: { children: ReactNode }) {
  return <SocialHubShell>{children}</SocialHubShell>;
}
