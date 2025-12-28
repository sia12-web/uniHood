"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { CampusProvider } from "@/components/providers/campus-provider";
import { ReportProvider } from "@/app/features/moderation/ReportProvider";

const AuthenticatedAppChrome = dynamic(() => import("@/components/AuthenticatedAppChrome"), {
  ssr: false,
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
  "/verify-university",
  "/admin",
  "/admin-login",
];

function ChromeWrapper({ children }: { children: ReactNode }) {
  const nextPathname = usePathname();
  const pathname = nextPathname || "/";

  const hideChrome = useMemo(() => {
    return NO_AUTH_CHROME_PREFIXES.some((route) => matchesRoutePrefix(pathname, route));
  }, [pathname]);

  if (hideChrome) {
    return <>{children}</>;
  }

  return <AuthenticatedAppChrome>{children}</AuthenticatedAppChrome>;
}

export default function AppChrome({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <CampusProvider>
        <ToastProvider>
          <ReportProvider>
            <ChromeWrapper>{children}</ChromeWrapper>
          </ReportProvider>
        </ToastProvider>
      </CampusProvider>
    </QueryProvider>
  );
}
