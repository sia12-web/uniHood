"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { ReportProvider } from "@/app/features/moderation/ReportProvider";

const AuthenticatedAppChrome = dynamic(() => import("@/components/AuthenticatedAppChrome"), {
  ssr: true,
});

const AUTH_CHROME_ROUTES = ["/login", "/onboarding", "/verify", "/admin"];

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";

  const hideChrome = useMemo(() => {
    return AUTH_CHROME_ROUTES.some((route) => pathname.startsWith(route));
  }, [pathname]);

  if (hideChrome) {
    return (
      <QueryProvider>
        <ToastProvider>
          <ReportProvider>
            {children}
          </ReportProvider>
        </ToastProvider>
      </QueryProvider>
    );
  }

  return (
    <QueryProvider>
      <ToastProvider>
        <ReportProvider>
          <AuthenticatedAppChrome>{children}</AuthenticatedAppChrome>
        </ReportProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
