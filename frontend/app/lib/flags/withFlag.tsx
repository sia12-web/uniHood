"use client";

import { memo, type ComponentType, isValidElement, type ReactElement, type ReactNode } from "react";

import { useFlags } from "./useFlags";
import type { FlagKey } from "./keys";

type FallbackComponent<P> = ComponentType<P> | ReactElement | ReactNode;

export function withFlag<P extends Record<string, unknown>>(
  flagKey: FlagKey,
  fallback?: FallbackComponent<P>,
) {
  return function withFlagWrapper(Component: ComponentType<P>) {
    const Guarded = (props: P) => {
      const { has } = useFlags();
      if (!has(flagKey)) {
        if (!fallback) {
          return null;
        }
        if (typeof fallback === "function") {
          const FallbackComponent = fallback as ComponentType<P>;
          return <FallbackComponent {...props} />;
        }
        if (isValidElement(fallback)) {
          return fallback;
        }
        return <>{fallback}</>;
      }
      return <Component {...props} />;
    };

    const displayName = Component.displayName || Component.name || "Component";
    Guarded.displayName = `withFlag(${flagKey})(${displayName})`;

    return memo(Guarded);
  };
}
