"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { CampusProvider } from "@/components/providers/campus-provider";
import { ReportProvider } from "@/app/features/moderation/ReportProvider";

const AuthenticatedAppChrome = dynamic(() => import("@/components/AuthenticatedAppChrome"), {
  ssr: true,
});

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") {
    return pathname === "/";
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Routes that should not mount the authenticated chrome (and its heavy, auth-dependent hooks).
// Includes auth/onboarding flows and public marketing/legal pages.
const NO_AUTH_CHROME_PREFIXES = [
  // Public marketing / legal
  "/contact",
  "/features",
  "/legal",
  "/privacy",
  "/terms",
  "/cookies",
  "/join",
  "/verify-email",

  // Auth / onboarding / admin
  "/login",
  "/reset-password",
  "/forgot-password",
  "/forgot-password",
  "/onboarding",
  "/onboarding",
  "/select-university",
  "/major-year",
  "/passions",
  "/vision",
  "/photos",
  "/set-profile",
  "/select-courses",
  "/welcome",
  "/verify",
  "/admin",
];

export default function AppChrome({ children }: { children: ReactNode }) {
  let pathname = "/";
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = usePathname() || "/";
  } catch {
    // In rare cases (e.g. certain error/SSR paths), Next's router context may be unavailable.
    // Fall back to a safe default instead of crashing the entire render.
    pathname = "/";
  }

  const hideChrome = useMemo(() => {
    return NO_AUTH_CHROME_PREFIXES.some((route) => matchesRoutePrefix(pathname, route));
  }, [pathname]);

  if (hideChrome) {
    return (
      <QueryProvider>
        <CampusProvider>
          <ToastProvider>
            <ReportProvider>
              {children}
            </ReportProvider>
          </ToastProvider>
        </CampusProvider>
      </QueryProvider>
    );
  }

  return (
    <QueryProvider>
      <CampusProvider>
        <ToastProvider>
          <ReportProvider>
            <AuthenticatedAppChrome>{children}</AuthenticatedAppChrome>
          </ReportProvider>
        </ToastProvider>
      </CampusProvider>
    </QueryProvider>
  );
}
