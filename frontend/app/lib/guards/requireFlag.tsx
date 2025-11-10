"use client";

import { useEffect, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { FlagKey } from "@/app/lib/flags/keys";
import { useFlags } from "@/app/lib/flags/useFlags";

type GuardOptions = {
  fallbackHref?: string;
  loading?: ReactNode;
};

type RequireFlagProps = {
  flag: FlagKey;
  children: ReactNode;
  fallbackHref?: string;
  loading?: ReactNode;
};

export function RequireFlag({ flag, children, fallbackHref = "/", loading = null }: RequireFlagProps) {
  const { has, ready } = useFlags();
  const router = useRouter();
  const allowed = has(flag);

  useEffect(() => {
    if (ready && !allowed) {
      router.replace(fallbackHref);
    }
  }, [allowed, fallbackHref, ready, router]);

  if (!ready) {
    return <>{loading}</>;
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}

export function requireFlag<P extends Record<string, unknown>>(
  flag: FlagKey,
  options?: GuardOptions,
) {
  return function withFlagGuard(Component: ComponentType<P>) {
    const Guarded = (props: P) => {
      return (
        <RequireFlag flag={flag} fallbackHref={options?.fallbackHref} loading={options?.loading}>
          <Component {...props} />
        </RequireFlag>
      );
    };

    Guarded.displayName = `requireFlag(${flag})(${Component.displayName ?? Component.name ?? "Component"})`;
    return Guarded;
  };
}
