import { useEffect, useState } from "react";

import type { SocketConnectionStatus } from "./base";

export function useSocketStatus(
  subscribe: (listener: (status: SocketConnectionStatus) => void) => (() => void) | void,
  getCurrent: () => SocketConnectionStatus,
): SocketConnectionStatus {
  const [status, setStatus] = useState<SocketConnectionStatus>(() => getCurrent());

  useEffect(() => {
    const teardown = subscribe((next) => {
      setStatus(next);
    });
    return () => {
      if (typeof teardown === "function") {
        teardown();
      }
    };
  }, [subscribe]);

  return status;
}
