"use client";
import { usePathname } from "next/navigation";

// import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const suppressedPrefixes = ["/onboarding", "/login", "/verify"];
  const shouldRenderChrome = !suppressedPrefixes.some((prefix) => pathname.startsWith(prefix));

  // Auth state unused in current minimal header; re-enable when header needs user context

  if (!shouldRenderChrome) {
    return null;
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3">
      <div aria-hidden="true" className="h-6 w-6" />
      <div aria-hidden="true" className="h-6 w-6" />
    </header>
  );
}
